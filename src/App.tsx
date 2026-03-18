import { useEffect, useState } from 'react'
import './App.css'

type StationName = 'Grill' | 'Saute' | 'Pastry' | 'Pantry' | 'Expo'

type PrepStatus = 'Not Started' | 'In Progress' | 'Ready'
type PrepPriority = 'Low' | 'Medium' | 'High'

type PrepItem = {
  id: string
  name: string
  station: StationName
  priority: PrepPriority
  status: PrepStatus
  dueTime: string
}

type InventoryItem = {
  id: string
  name: string
  quantity: number
  unit: string
  threshold: number
}

type EightySixItem = {
  id: string
  item: string
  change: string
  timestamp: string
}

type ShiftNote = {
  id: string
  station: StationName
  message: string
  timestamp: string
}

type StationStatus = {
  id: string
  name: StationName
  workload: 'Light' | 'Moderate' | 'Heavy'
  activeTasks: number
  readyItems: number
}

const stationNames: StationName[] = ['Grill', 'Saute', 'Pastry', 'Pantry', 'Expo']

const initialPrepItems: PrepItem[] = [
  {
    id: 'prep-1',
    name: 'Burger patties',
    station: 'Grill',
    priority: 'High',
    status: 'In Progress',
    dueTime: '11:00 AM',
  },
  {
    id: 'prep-2',
    name: 'Pickled onions',
    station: 'Pantry',
    priority: 'Medium',
    status: 'Ready',
    dueTime: '10:30 AM',
  },
  {
    id: 'prep-3',
    name: 'Aioli batch',
    station: 'Pantry',
    priority: 'High',
    status: 'Not Started',
    dueTime: '11:15 AM',
  },
  {
    id: 'prep-4',
    name: 'Creme brulee base',
    station: 'Pastry',
    priority: 'Low',
    status: 'Ready',
    dueTime: '10:45 AM',
  },
]

const initialInventoryItems: InventoryItem[] = [
  {
    id: 'inv-1',
    name: 'Salmon portions',
    quantity: 4,
    unit: 'left',
    threshold: 6,
  },
  {
    id: 'inv-2',
    name: 'Brioche buns',
    quantity: 12,
    unit: 'count',
    threshold: 10,
  },
  {
    id: 'inv-3',
    name: 'Fryer oil reserve',
    quantity: 1,
    unit: 'jug',
    threshold: 2,
  },
]

const initialEightySixItems: EightySixItem[] = [
  {
    id: 'eighty-six-1',
    item: 'Salmon entree',
    change: 'Route guests to striped bass feature until next delivery.',
    timestamp: '5:40 PM',
  },
  {
    id: 'eighty-six-2',
    item: 'Truffle aioli',
    change: 'Swap to lemon aioli on fries and burger add-ons.',
    timestamp: '5:18 PM',
  },
  {
    id: 'eighty-six-3',
    item: 'Lemon tart slice',
    change: 'Offer creme brulee or chocolate budino for dessert push.',
    timestamp: '4:55 PM',
  },
]

const initialShiftNotes: ShiftNote[] = [
  {
    id: 'note-1',
    station: 'Expo',
    message: '86 salmon after current tickets. Push chicken feature if needed.',
    timestamp: '5:42 PM',
  },
  {
    id: 'note-2',
    station: 'Pantry',
    message: 'Extra aioli needed before dinner rush. Make one backup squeeze bottle.',
    timestamp: '5:30 PM',
  },
  {
    id: 'note-3',
    station: 'Grill',
    message: 'Flat top cleaned and reset. Steak temp chart posted near pass.',
    timestamp: '5:12 PM',
  },
]

const stationStatuses: StationStatus[] = [
  {
    id: 'station-1',
    name: 'Grill',
    workload: 'Heavy',
    activeTasks: 4,
    readyItems: 2,
  },
  {
    id: 'station-2',
    name: 'Saute',
    workload: 'Moderate',
    activeTasks: 3,
    readyItems: 4,
  },
  {
    id: 'station-3',
    name: 'Pastry',
    workload: 'Light',
    activeTasks: 1,
    readyItems: 3,
  },
  {
    id: 'station-4',
    name: 'Pantry',
    workload: 'Moderate',
    activeTasks: 2,
    readyItems: 5,
  },
  {
    id: 'station-5',
    name: 'Expo',
    workload: 'Heavy',
    activeTasks: 5,
    readyItems: 0,
  },
]

const storageKeys = {
  prepItems: 'lineflow.prepItems',
  inventoryItems: 'lineflow.inventoryItems',
  eightySixItems: 'lineflow.eightySixItems',
  shiftNotes: 'lineflow.shiftNotes',
} as const

let fallbackIdCounter = 0

const createRuntimeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  fallbackIdCounter += 1
  return `${prefix}-${fallbackIdCounter}`
}

const loadStoredState = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const storedValue = window.localStorage.getItem(key)
    if (!storedValue) {
      return fallback
    }

    return JSON.parse(storedValue) as T
  } catch {
    return fallback
  }
}

const formatDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

const sectionLabels = {
  snapshot: 'Service Snapshot',
  'prep-board': 'Prep Board',
  stations: 'Stations',
  inventory: 'Inventory',
  'eighty-six': "86'd Items",
  notes: 'Shift Notes',
} as const

type SectionId = keyof typeof sectionLabels
const sectionIds = Object.keys(sectionLabels) as SectionId[]

const isSectionId = (value: string): value is SectionId => sectionIds.includes(value as SectionId)

const formatCurrentTime = () =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date())

const priorityScore: Record<PrepPriority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
}

const getInventoryStatus = (
  quantity: number,
  threshold: number,
): 'OK' | 'Low' | 'Critical' => {
  const criticalLimit = Math.max(1, Math.floor(threshold / 2))
  if (quantity <= criticalLimit) {
    return 'Critical'
  }

  if (quantity <= threshold) {
    return 'Low'
  }

  return 'OK'
}

function App() {
  const [prepItems, setPrepItems] = useState<PrepItem[]>(() =>
    loadStoredState(storageKeys.prepItems, initialPrepItems),
  )
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() =>
    loadStoredState(storageKeys.inventoryItems, initialInventoryItems),
  )
  const [eightySixItems, setEightySixItems] = useState<EightySixItem[]>(() =>
    loadStoredState(storageKeys.eightySixItems, initialEightySixItems),
  )
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>(() =>
    loadStoredState(storageKeys.shiftNotes, initialShiftNotes),
  )
  const [activeSection, setActiveSection] = useState<SectionId>('snapshot')
  const [actionAnnouncement, setActionAnnouncement] = useState('')
  const [handoffMessage, setHandoffMessage] = useState('')
  const [isPrepFormOpen, setIsPrepFormOpen] = useState(false)
  const [isInventoryFormOpen, setIsInventoryFormOpen] = useState(false)
  const [isEightySixFormOpen, setIsEightySixFormOpen] = useState(false)
  const [selectedStation, setSelectedStation] = useState<StationName | null>(null)
  const [newPrepName, setNewPrepName] = useState('')
  const [newPrepStation, setNewPrepStation] = useState<StationName>('Grill')
  const [newPrepPriority, setNewPrepPriority] = useState<PrepPriority>('Medium')
  const [newPrepDueTime, setNewPrepDueTime] = useState('11:30 AM')
  const [newInventoryName, setNewInventoryName] = useState('')
  const [newInventoryQuantity, setNewInventoryQuantity] = useState('0')
  const [newInventoryUnit, setNewInventoryUnit] = useState('count')
  const [newInventoryThreshold, setNewInventoryThreshold] = useState('1')
  const [editingInventoryItemId, setEditingInventoryItemId] = useState<string | null>(null)
  const [editingInventoryName, setEditingInventoryName] = useState('')
  const [editingInventoryUnit, setEditingInventoryUnit] = useState('count')
  const [editingInventoryThreshold, setEditingInventoryThreshold] = useState('1')
  const [newEightySixItem, setNewEightySixItem] = useState('')
  const [newEightySixChange, setNewEightySixChange] = useState('')

  const openPrepCount = prepItems.filter((item) => item.status !== 'Ready').length
  const readyPrepCount = prepItems.filter((item) => item.status === 'Ready').length
  const criticalStockCount = inventoryItems.filter(
    (item) => getInventoryStatus(item.quantity, item.threshold) !== 'OK',
  ).length

  const workloadByStation = stationStatuses.reduce<Record<StationName, StationStatus['workload']>>(
    (accumulator, station) => {
      accumulator[station.name] = station.workload
      return accumulator
    },
    {
      Grill: 'Moderate',
      Saute: 'Moderate',
      Pastry: 'Moderate',
      Pantry: 'Moderate',
      Expo: 'Moderate',
    },
  )

  const stationSummaries = stationNames.map((stationName) => {
    const stationPrepItems = prepItems.filter((item) => item.station === stationName)
    const pendingItems = stationPrepItems.filter((item) => item.status !== 'Ready')
    const topPriority = pendingItems.reduce<PrepPriority | null>((highestPriority, item) => {
      if (!highestPriority || priorityScore[item.priority] > priorityScore[highestPriority]) {
        return item.priority
      }

      return highestPriority
    }, null)

    return {
      name: stationName,
      workload: workloadByStation[stationName],
      activeTasks: pendingItems.length,
      readyItems: stationPrepItems.filter((item) => item.status === 'Ready').length,
      topPriority,
    }
  }).sort((leftStation, rightStation) => {
    const priorityDifference =
      (rightStation.topPriority ? priorityScore[rightStation.topPriority] : 0) -
      (leftStation.topPriority ? priorityScore[leftStation.topPriority] : 0)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    if (rightStation.activeTasks !== leftStation.activeTasks) {
      return rightStation.activeTasks - leftStation.activeTasks
    }

    return leftStation.name.localeCompare(rightStation.name)
  })

  const stationOrder = stationSummaries.reduce<Record<StationName, number>>((accumulator, station, index) => {
    accumulator[station.name] = index
    return accumulator
  }, {
    Grill: 0,
    Saute: 1,
    Pastry: 2,
    Pantry: 3,
    Expo: 4,
  })

  const sortedPrepItems = [...prepItems].sort((leftItem, rightItem) => {
    const stationDifference = stationOrder[leftItem.station] - stationOrder[rightItem.station]
    if (stationDifference !== 0) {
      return stationDifference
    }

    const readinessDifference = Number(leftItem.status === 'Ready') - Number(rightItem.status === 'Ready')
    if (readinessDifference !== 0) {
      return readinessDifference
    }

    const priorityDifference = priorityScore[rightItem.priority] - priorityScore[leftItem.priority]
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    return leftItem.name.localeCompare(rightItem.name)
  })

  const visiblePrepItems = sortedPrepItems.filter((item) => item.status !== 'Ready')

  const activeStations = stationSummaries.filter((station) => station.activeTasks > 0).length
  const dateLabel = formatDate.format(new Date())

  const selectedStationPrepItems = selectedStation
    ? prepItems.filter((item) => item.station === selectedStation)
    : []
  const selectedStationButtonId = selectedStation
    ? `station-toggle-${selectedStation.toLowerCase()}`
    : undefined

  const announceAction = (message: string) => {
    setActionAnnouncement('')
    window.setTimeout(() => {
      setActionAnnouncement(message)
    }, 0)
  }

  const addShiftNote = (station: StationName, message: string) => {
    setShiftNotes((currentNotes) => [
      {
        id: createRuntimeId('note'),
        station,
        message,
        timestamp: formatCurrentTime(),
      },
      ...currentNotes,
    ])
  }

  useEffect(() => {
    const syncActiveFromHash = () => {
      const hashValue = window.location.hash.replace('#', '')
      if (isSectionId(hashValue)) {
        setActiveSection(hashValue)
      }
    }

    syncActiveFromHash()
    window.addEventListener('hashchange', syncActiveFromHash)

    return () => {
      window.removeEventListener('hashchange', syncActiveFromHash)
    }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((leftEntry, rightEntry) => rightEntry.intersectionRatio - leftEntry.intersectionRatio)[0]

        if (visibleSection && isSectionId(visibleSection.target.id)) {
          setActiveSection(visibleSection.target.id)
        }
      },
      {
        rootMargin: '-35% 0px -45% 0px',
        threshold: [0.2, 0.5, 0.8],
      },
    )

    sectionIds.forEach((id) => {
      const section = document.getElementById(id)
      if (section) {
        observer.observe(section)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.prepItems, JSON.stringify(prepItems))
    }
  }, [prepItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.inventoryItems, JSON.stringify(inventoryItems))
    }
  }, [inventoryItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.eightySixItems, JSON.stringify(eightySixItems))
    }
  }, [eightySixItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.shiftNotes, JSON.stringify(shiftNotes))
    }
  }, [shiftNotes])

  const handleGenerateHandoff = () => {
    const pendingPrep = prepItems
      .filter((item) => item.status !== 'Ready')
      .map((item) => item.name)
      .join(', ')

    const lowStockItems = inventoryItems
      .filter((item) => getInventoryStatus(item.quantity, item.threshold) !== 'OK')
      .map((item) => item.name)
      .join(', ')

    const summary =
      `Handoff for ${dateLabel}: ${openPrepCount} prep items open (${pendingPrep || 'none'}). ` +
      `${criticalStockCount} low-stock alerts (${lowStockItems || 'none'}). ` +
      `${activeStations} active stations.`

    setHandoffMessage(summary)
    announceAction('Handoff summary generated.')
  }

  const handleAddPrepItem = () => {
    const name = newPrepName.trim()
    if (!name) {
      return
    }

    const prepId = createRuntimeId('prep')

    const newItem: PrepItem = {
      id: prepId,
      name,
      station: newPrepStation,
      priority: newPrepPriority,
      status: 'Not Started',
      dueTime: newPrepDueTime.trim() || 'TBD',
    }

    setPrepItems((currentItems) => [newItem, ...currentItems])

    addShiftNote(newPrepStation, `Prep added: ${name} (${newPrepPriority} priority), due ${newItem.dueTime}.`)

    setNewPrepName('')
    setNewPrepPriority('Medium')
    setNewPrepDueTime('11:30 AM')
    setHandoffMessage('')
    setIsPrepFormOpen(false)
    announceAction(`${name} added to prep for ${newPrepStation}.`)
  }

  const updateInventoryQuantity = (itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0

    setInventoryItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: safeQuantity,
            }
          : item,
      ),
    )
  }

  const handleAddInventoryItem = () => {
    const name = newInventoryName.trim()
    const quantity = Math.max(0, Math.floor(Number(newInventoryQuantity)))
    const threshold = Math.max(1, Math.floor(Number(newInventoryThreshold)))
    const unit = newInventoryUnit.trim() || 'count'

    if (!name || !Number.isFinite(quantity) || !Number.isFinite(threshold)) {
      return
    }

    setInventoryItems((currentItems) => [
      {
        id: createRuntimeId('inventory'),
        name,
        quantity,
        unit,
        threshold,
      },
      ...currentItems,
    ])

    setNewInventoryName('')
    setNewInventoryQuantity('0')
    setNewInventoryUnit('count')
    setNewInventoryThreshold('1')
    setIsInventoryFormOpen(false)
    addShiftNote('Expo', `Inventory added: ${name}, ${quantity} ${unit} on hand with threshold ${threshold}.`)
    announceAction(`${name} added to inventory.`)
  }

  const startEditingInventoryItem = (item: InventoryItem) => {
    setEditingInventoryItemId(item.id)
    setEditingInventoryName(item.name)
    setEditingInventoryUnit(item.unit)
    setEditingInventoryThreshold(String(item.threshold))
  }

  const cancelEditingInventoryItem = () => {
    setEditingInventoryItemId(null)
    setEditingInventoryName('')
    setEditingInventoryUnit('count')
    setEditingInventoryThreshold('1')
  }

  const handleSaveInventoryItem = (itemId: string) => {
    const name = editingInventoryName.trim()
    const unit = editingInventoryUnit.trim() || 'count'
    const threshold = Math.max(1, Math.floor(Number(editingInventoryThreshold)))

    if (!name || !Number.isFinite(threshold)) {
      return
    }

    setInventoryItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              name,
              unit,
              threshold,
            }
          : item,
      ),
    )

    cancelEditingInventoryItem()
    announceAction(`${name} inventory details updated.`)
  }

  const handleRemoveInventoryItem = (itemId: string) => {
    const targetItem = inventoryItems.find((item) => item.id === itemId)

    if (!targetItem || !window.confirm(`Remove ${targetItem.name} from inventory?`)) {
      return
    }

    setInventoryItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    if (editingInventoryItemId === itemId) {
      cancelEditingInventoryItem()
    }

    addShiftNote('Expo', `Inventory removed: ${targetItem.name} was taken off the watchlist.`)
    announceAction(`${targetItem.name} removed from inventory.`)
  }

  const updatePrepItemStatus = (itemId: string, status: PrepStatus) => {
    const targetItem = prepItems.find((item) => item.id === itemId)
    if (!targetItem) {
      return
    }

    setPrepItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status,
            }
          : item,
      ),
    )

    if (status === 'Ready' && targetItem.status !== 'Ready') {
        addShiftNote(targetItem.station, `${targetItem.name} marked ready on ${targetItem.station}.`)

      announceAction(`${targetItem.name} marked ready.`)
    }
  }

  const handleAddEightySixItem = () => {
    const itemName = newEightySixItem.trim()
    const change = newEightySixChange.trim()

    if (!itemName || !change) {
      return
    }

    setEightySixItems((currentItems) => [
      {
        id: createRuntimeId('eighty-six'),
        item: itemName,
        change,
        timestamp: formatCurrentTime(),
      },
      ...currentItems,
    ])

    setNewEightySixItem('')
    setNewEightySixChange('')
    setIsEightySixFormOpen(false)
    announceAction(`${itemName} added to 86'd items.`)
  }

  const handleRemoveEightySixItem = (itemId: string) => {
    const targetItem = eightySixItems.find((entry) => entry.id === itemId)
    setEightySixItems((currentItems) => currentItems.filter((entry) => entry.id !== itemId))
    if (targetItem) {
      announceAction(`${targetItem.item} removed from 86'd items.`)
    }
  }

  const handleClearEightySixItems = () => {
    if (!window.confirm("Clear all 86'd items?")) {
      return
    }

    setEightySixItems([])
    setIsEightySixFormOpen(false)
    announceAction("All 86'd items cleared.")
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {actionAnnouncement}
      </div>
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">BOH operations</p>
          <h1 className="brand-title">LineFlow</h1>
          <p className="brand-copy">
            A live dashboard for prep visibility, low-stock awareness, and shift handoff.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard sections">
          {sectionIds.map((sectionId) => (
            <a
              key={sectionId}
              className={activeSection === sectionId ? 'is-active' : undefined}
              href={`#${sectionId}`}
              aria-current={activeSection === sectionId ? 'location' : undefined}
            >
              {sectionLabels[sectionId]}
            </a>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-label">Current shift</span>
          <strong>Dinner push</strong>
          <p>Focus on prep completion before 5:30 PM and watch critical stock counts.</p>
        </div>
      </aside>

      <main id="main-content" className="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Back of House Dashboard</p>
            <h2>Keep service moving without chasing paper notes.</h2>
          </div>

          <div className="topbar-meta">
            <div className="shift-pill">
              <span>Live shift</span>
              <strong>{dateLabel}</strong>
            </div>
            <button className="action-button" type="button" onClick={handleGenerateHandoff}>
              Generate Handoff
            </button>
          </div>
        </header>

        {handoffMessage && (
          <p className="handoff-message" role="status" aria-live="polite">
            {handoffMessage}
          </p>
        )}

          <section id="snapshot" className="snapshot-grid" aria-label="Service snapshot">
          <section
              className="metric-card"
          >
              <span className="metric-label">Open prep</span>
              <strong>{openPrepCount}</strong>
              <p>Items still in progress before service starts.</p>
          </section>
            <section className="metric-card accent-teal">
              <span className="metric-label">Ready to fire</span>
              <strong>{readyPrepCount}</strong>
              <p>Prep items completed and ready for line use.</p>
            </section>
            <section className="metric-card accent-amber">
              <span className="metric-label">Low stock alerts</span>
              <strong>{criticalStockCount}</strong>
              <p>Items that need attention before dinner rush.</p>
            </section>
            <section className="metric-card accent-coral">
              <span className="metric-label">Active stations</span>
              <strong>{activeStations}</strong>
              <p>Stations currently carrying active tasks.</p>
            </section>
          </section>

          <section className="dashboard-grid">
            <section id="prep-board" className="panel prep-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Prep board</p>
                <h3>What still needs attention</h3>
              </div>
              <span className="panel-badge">{visiblePrepItems.length} open</span>
            </div>

            <div className="prep-list">
              <div className="prep-actions">
                <button
                  className="action-button prep-action-button"
                  type="button"
                  onClick={() => setIsPrepFormOpen((isOpen) => !isOpen)}
                >
                  {isPrepFormOpen ? 'Cancel New Prep' : 'New Prep Entry'}
                </button>
              </div>

              {isPrepFormOpen && (
                <form
                  className="prep-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleAddPrepItem()
                  }}
                >
                  <label>
                    Item
                    <input
                      value={newPrepName}
                      onChange={(event) => setNewPrepName(event.target.value)}
                      placeholder="e.g. Herb butter"
                      required
                    />
                  </label>

                  <label>
                    Station
                    <select
                      value={newPrepStation}
                      onChange={(event) => setNewPrepStation(event.target.value as StationName)}
                    >
                      {stationNames.map((stationName) => (
                        <option key={stationName} value={stationName}>
                          {stationName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Priority
                    <select
                      value={newPrepPriority}
                      onChange={(event) => setNewPrepPriority(event.target.value as PrepPriority)}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>

                  <label>
                    Due Time
                    <input
                      value={newPrepDueTime}
                      onChange={(event) => setNewPrepDueTime(event.target.value)}
                      placeholder="e.g. 4:45 PM"
                    />
                  </label>

                  <button className="action-button prep-submit" type="submit">
                    Add Prep Item
                  </button>
                </form>
              )}

              {visiblePrepItems.length === 0 ? (
                <p className="prep-empty">All prep items are complete.</p>
              ) : (
                visiblePrepItems.map((item) => (
                  <article className="prep-card" key={item.id}>
                    <div className="prep-header-row">
                      <div>
                        <h4>{item.name}</h4>
                        <p>{item.station} station</p>
                      </div>
                      <span className={`status-chip status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="prep-meta">
                      <span className={`priority-chip priority-${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                      <span>Due {item.dueTime}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
            </section>

            <section id="inventory" className="panel side-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Inventory alerts</p>
                <h3>Watchlist before service</h3>
              </div>
              <span className="panel-badge">{inventoryItems.length} items</span>
            </div>

            <div className="inventory-list">
              <div className="inventory-actions">
                <button
                  className="action-button prep-action-button"
                  type="button"
                  onClick={() => setIsInventoryFormOpen((isOpen) => !isOpen)}
                >
                  {isInventoryFormOpen ? 'Cancel Item' : 'Add Inventory Item'}
                </button>
              </div>

              {isInventoryFormOpen && (
                <form
                  className="prep-form inventory-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleAddInventoryItem()
                  }}
                >
                  <label>
                    Item
                    <input
                      value={newInventoryName}
                      onChange={(event) => setNewInventoryName(event.target.value)}
                      placeholder="e.g. Chicken stock"
                      required
                    />
                  </label>

                  <label>
                    Quantity
                    <input
                      type="number"
                      min={0}
                      value={newInventoryQuantity}
                      onChange={(event) => setNewInventoryQuantity(event.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Unit
                    <input
                      value={newInventoryUnit}
                      onChange={(event) => setNewInventoryUnit(event.target.value)}
                      placeholder="e.g. qt"
                      required
                    />
                  </label>

                  <label>
                    Threshold
                    <input
                      type="number"
                      min={1}
                      value={newInventoryThreshold}
                      onChange={(event) => setNewInventoryThreshold(event.target.value)}
                      required
                    />
                  </label>

                  <button className="action-button prep-submit" type="submit">
                    Save Inventory Item
                  </button>
                </form>
              )}

              {inventoryItems.map((item) => (
                <article className="inventory-item" key={item.id}>
                    <div className="inventory-item-main">
                      {editingInventoryItemId === item.id ? (
                        <div className="inventory-edit-fields">
                          <label>
                            Item
                            <input
                              value={editingInventoryName}
                              onChange={(event) => setEditingInventoryName(event.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Unit
                            <input
                              value={editingInventoryUnit}
                              onChange={(event) => setEditingInventoryUnit(event.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Threshold
                            <input
                              type="number"
                              min={1}
                              value={editingInventoryThreshold}
                              onChange={(event) => setEditingInventoryThreshold(event.target.value)}
                              required
                            />
                          </label>
                        </div>
                      ) : (
                        <div>
                          <h4>{item.name}</h4>
                          <p>
                            {item.quantity} {item.unit} remaining · threshold {item.threshold}
                          </p>
                        </div>
                      )}
                    </div>

                  <div className="inventory-controls">
                    <button
                      className="inventory-stepper"
                      type="button"
                      onClick={() => updateInventoryQuantity(item.id, item.quantity - 1)}
                      aria-label={`Decrease ${item.name} count`}
                    >
                      -
                    </button>
                    <input
                      className="inventory-input"
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(event) => updateInventoryQuantity(item.id, Number(event.target.value))}
                      aria-label={`${item.name} count`}
                    />
                    <button
                      className="inventory-stepper"
                      type="button"
                      onClick={() => updateInventoryQuantity(item.id, item.quantity + 1)}
                      aria-label={`Increase ${item.name} count`}
                    >
                      +
                    </button>
                  </div>

                  <span
                    className={`status-chip status-${getInventoryStatus(item.quantity, item.threshold).toLowerCase()}`}
                  >
                    {getInventoryStatus(item.quantity, item.threshold)}
                  </span>

                  <div className="inventory-item-actions">
                      {editingInventoryItemId === item.id ? (
                        <>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleSaveInventoryItem(item.id)}
                          >
                            Save
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={cancelEditingInventoryItem}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => startEditingInventoryItem(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="secondary-button danger-button"
                            type="button"
                            onClick={() => handleRemoveInventoryItem(item.id)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                  </div>
                </article>
              ))}
            </div>
          </section>

            <section id="eighty-six" className="panel side-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Menu changes</p>
                <h3>86'd items</h3>
              </div>
              <div className="eighty-six-toolbar">
                <span className="panel-badge">{eightySixItems.length} entries</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleClearEightySixItems}
                  disabled={eightySixItems.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="eighty-six-list">
              <div className="eighty-six-actions">
                <button
                  className="action-button prep-action-button"
                  type="button"
                  onClick={() => setIsEightySixFormOpen((isOpen) => !isOpen)}
                >
                  {isEightySixFormOpen ? "Cancel 86'd Item" : "Add 86'd Item"}
                </button>
              </div>

              {isEightySixFormOpen && (
                <form
                  className="prep-form eighty-six-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleAddEightySixItem()
                  }}
                >
                  <label>
                    Item
                    <input
                      value={newEightySixItem}
                      onChange={(event) => setNewEightySixItem(event.target.value)}
                      placeholder="e.g. Ribeye special"
                      required
                    />
                  </label>

                  <label>
                    Menu change
                    <input
                      value={newEightySixChange}
                      onChange={(event) => setNewEightySixChange(event.target.value)}
                      placeholder="e.g. Push pork chop feature instead"
                      required
                    />
                  </label>

                  <button className="action-button prep-submit" type="submit">
                    Save 86'd Item
                  </button>
                </form>
              )}

              {eightySixItems.length === 0 ? (
                <p className="prep-empty">No current menu changes.</p>
              ) : (
                eightySixItems.map((entry) => (
                  <article className="eighty-six-item" key={entry.id}>
                    <div className="note-meta">
                      <span>{entry.item}</span>
                      <span>{entry.timestamp}</span>
                    </div>
                    <p>{entry.change}</p>
                    <div className="eighty-six-item-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleRemoveEightySixItem(entry.id)}
                      >
                        Resolve
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

            <section id="stations" className="panel stations-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Stations</p>
                <h3>Line health overview</h3>
              </div>
            </div>

            <div className="station-grid">
              {stationSummaries.map((station) => (
                <button
                    id={`station-toggle-${station.name.toLowerCase()}`}
                  className={`station-card station-button ${selectedStation === station.name ? 'is-selected' : ''}`}
                  key={station.name}
                  type="button"
                    aria-expanded={selectedStation === station.name}
                    aria-pressed={selectedStation === station.name}
                    aria-controls={selectedStation === station.name ? 'station-detail-panel' : undefined}
                  onClick={() =>
                    setSelectedStation((currentSelection) =>
                      currentSelection === station.name ? null : station.name,
                    )
                  }
                >
                  <div className="station-head">
                    <h4>{station.name}</h4>
                    <span className={`load-pill load-${station.workload.toLowerCase()}`}>{station.workload}</span>
                  </div>
                  <p>{station.topPriority ? `${station.topPriority} priority focus` : 'No open prep items'}</p>
                  <p>{station.activeTasks} active tasks</p>
                  <p>{station.readyItems} ready items</p>
                </button>
              ))}
            </div>

            {selectedStation && (
              <div
                id="station-detail-panel"
                className="station-lines"
                aria-live="polite"
                role="region"
                aria-labelledby={selectedStationButtonId}
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{selectedStation} prep</p>
                    <h3>Line items</h3>
                  </div>
                  <span className="panel-badge">{selectedStationPrepItems.length} items</span>
                </div>

                {selectedStationPrepItems.length === 0 ? (
                  <p className="station-lines-empty">No prep items assigned yet.</p>
                ) : (
                  <div className="station-lines-list">
                    {selectedStationPrepItems.map((item) => (
                      <article key={item.id} className="station-line-item">
                        <div>
                          <h4>{item.name}</h4>
                          <p>Due {item.dueTime}</p>
                        </div>
                        <div className="station-line-meta">
                          <span className={`priority-chip priority-${item.priority.toLowerCase()}`}>
                            {item.priority}
                          </span>
                          <span
                            className={`status-chip status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {item.status}
                          </span>
                          <button
                            className="mark-ready-button"
                            type="button"
                            onClick={() => updatePrepItemStatus(item.id, 'Ready')}
                            disabled={item.status === 'Ready'}
                          >
                            Mark Ready
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
            </section>

            <section id="notes" className="panel notes-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Shift notes</p>
                <h3>Recent handoff context</h3>
              </div>
            </div>

            <div className="notes-list">
              {shiftNotes.map((note) => (
                <article className="note-card" key={note.id}>
                  <div className="note-meta">
                    <span>{note.station}</span>
                    <span>{note.timestamp}</span>
                  </div>
                  <p>{note.message}</p>
                </article>
              ))}
            </div>
          </section>
          </section>
      </main>
    </div>
  )
}

export default App
