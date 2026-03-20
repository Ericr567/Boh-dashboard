import { useEffect, useRef, useState } from 'react'
import './App.css'

type StationName = 'Grill' | 'Saute' | 'Pastry' | 'Pantry' | 'Expo' | 'Head Chef' | 'Sous Chef'

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

type AuditEntry = {
  id: string
  category: 'Prep' | 'Inventory'
  message: string
  timestamp: string
}

type AuditFilter = 'All' | AuditEntry['category']
type PrepStationFilter = 'All' | StationName
type InventoryStatusFilter = 'All' | 'OK' | 'Low' | 'Critical'

type UndoState = {
  message: string
  onUndo: () => void
}

const stationNames: StationName[] = ['Grill', 'Saute', 'Pastry', 'Pantry', 'Expo', 'Head Chef', 'Sous Chef']

const initialInventoryItems: InventoryItem[] = []
const initialEightySixItems: EightySixItem[] = []
const initialShiftNotes: ShiftNote[] = []
const initialAuditEntries: AuditEntry[] = []

const legacySeededInventoryIds = new Set(['inv-1', 'inv-2', 'inv-3'])
const legacySeededEightySixIds = new Set(['eighty-six-1', 'eighty-six-2', 'eighty-six-3'])
const legacySeededShiftNoteIds = new Set(['note-1', 'note-2', 'note-3'])
const legacySeededAuditIds = new Set(['audit-1', 'audit-2'])

const storageKeys = {
  prepItems: 'lineflow.prepItems',
  inventoryItems: 'lineflow.inventoryItems',
  eightySixItems: 'lineflow.eightySixItems',
  shiftNotes: 'lineflow.shiftNotes',
  auditEntries: 'lineflow.auditEntries',
} as const

let fallbackIdCounter = 0

const createRuntimeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  fallbackIdCounter += 1
  return `${prefix}-${fallbackIdCounter}`
}

const legacyStationNames: Partial<Record<string, StationName>> = {
  Prep: 'Pantry',
  Fry: 'Saute',
}

const isStationName = (value: unknown): value is StationName =>
  typeof value === 'string' && stationNames.includes(value as StationName)

const normalizeStationName = (value: unknown, fallback: StationName): StationName => {
  if (isStationName(value)) {
    return value
  }

  if (typeof value === 'string' && legacyStationNames[value]) {
    return legacyStationNames[value]
  }

  return fallback
}

const loadStoredInventoryItems = (value: unknown): InventoryItem[] => {
  if (!Array.isArray(value)) {
    return initialInventoryItems
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const item = entry as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.unit !== 'string') {
        return null
      }

      const quantity = Number(item.quantity)
      const threshold = Number(item.threshold)

      return {
        id: item.id,
        name: item.name,
        quantity: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0,
        unit: item.unit,
        threshold: Number.isFinite(threshold) ? Math.max(1, Math.floor(threshold)) : 1,
      }
    })
    .filter((item): item is InventoryItem => item !== null && !legacySeededInventoryIds.has(item.id))
}

const loadStoredEightySixItems = (value: unknown): EightySixItem[] => {
  if (!Array.isArray(value)) {
    return initialEightySixItems
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const item = entry as Record<string, unknown>
      if (
        typeof item.id !== 'string' ||
        typeof item.item !== 'string' ||
        typeof item.change !== 'string' ||
        typeof item.timestamp !== 'string'
      ) {
        return null
      }

      return {
        id: item.id,
        item: item.item,
        change: item.change,
        timestamp: item.timestamp,
      }
    })
    .filter((item): item is EightySixItem => item !== null && !legacySeededEightySixIds.has(item.id))
}

const loadStoredShiftNotes = (value: unknown): ShiftNote[] => {
  if (!Array.isArray(value)) {
    return initialShiftNotes
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const note = entry as Record<string, unknown>
      if (
        typeof note.id !== 'string' ||
        typeof note.message !== 'string' ||
        typeof note.timestamp !== 'string'
      ) {
        return null
      }

      return {
        id: note.id,
        station: normalizeStationName(note.station, 'Expo'),
        message: note.message,
        timestamp: note.timestamp,
      }
    })
    .filter((note): note is ShiftNote => note !== null && !legacySeededShiftNoteIds.has(note.id))
}

const loadStoredAuditEntries = (value: unknown): AuditEntry[] => {
  if (!Array.isArray(value)) {
    return initialAuditEntries
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const auditEntry = entry as Record<string, unknown>
      if (
        typeof auditEntry.id !== 'string' ||
        typeof auditEntry.message !== 'string' ||
        typeof auditEntry.timestamp !== 'string'
      ) {
        return null
      }

      return {
        id: auditEntry.id,
        category: auditEntry.category === 'Prep' ? 'Prep' : 'Inventory',
        message: auditEntry.message,
        timestamp: auditEntry.timestamp,
      }
    })
    .filter((entry): entry is AuditEntry => entry !== null && !legacySeededAuditIds.has(entry.id))
}

const loadStoredState = <T,>(key: string, fallback: T, normalize: (value: unknown) => T): T => {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const storedValue = window.localStorage.getItem(key)
    if (!storedValue) {
      return fallback
    }

    return normalize(JSON.parse(storedValue))
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

const getStationDomId = (stationName: StationName) =>
  `station-toggle-${stationName.toLowerCase().replace(/\s+/g, '-')}`

function App() {
  const [prepItems, setPrepItems] = useState<PrepItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() =>
    loadStoredState(storageKeys.inventoryItems, initialInventoryItems, loadStoredInventoryItems),
  )
  const [eightySixItems, setEightySixItems] = useState<EightySixItem[]>(() =>
    loadStoredState(storageKeys.eightySixItems, initialEightySixItems, loadStoredEightySixItems),
  )
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>(() =>
    loadStoredState(storageKeys.shiftNotes, initialShiftNotes, loadStoredShiftNotes),
  )
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() =>
    loadStoredState(storageKeys.auditEntries, initialAuditEntries, loadStoredAuditEntries),
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
  const [inventoryFormError, setInventoryFormError] = useState('')
  const [editingInventoryError, setEditingInventoryError] = useState('')
  const [inventoryQuantityDrafts, setInventoryQuantityDrafts] = useState<Record<string, string>>({})
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('All')
  const [newEightySixItem, setNewEightySixItem] = useState('')
  const [newEightySixChange, setNewEightySixChange] = useState('')
  const [prepSearchQuery, setPrepSearchQuery] = useState('')
  const [prepStationFilter, setPrepStationFilter] = useState<PrepStationFilter>('All')
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<InventoryStatusFilter>('All')
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const undoTimeoutRef = useRef<number | null>(null)

  const openPrepCount = prepItems.filter((item) => item.status !== 'Ready').length
  const readyPrepCount = prepItems.filter((item) => item.status === 'Ready').length
  const criticalStockCount = inventoryItems.filter(
    (item) => getInventoryStatus(item.quantity, item.threshold) !== 'OK',
  ).length

  const workloadByStation = stationNames.reduce<
    Record<StationName, 'Light' | 'Moderate' | 'Heavy'>
  >((accumulator, stationName) => {
    const activeTasks = prepItems.filter(
      (item) => item.station === stationName && item.status !== 'Ready',
    ).length

    if (activeTasks >= 3) {
      accumulator[stationName] = 'Heavy'
    } else if (activeTasks >= 1) {
      accumulator[stationName] = 'Moderate'
    } else {
      accumulator[stationName] = 'Light'
    }

    return accumulator
  }, {
    Grill: 'Light',
    Saute: 'Light',
    Pastry: 'Light',
    Pantry: 'Light',
    Expo: 'Light',
    'Head Chef': 'Light',
    'Sous Chef': 'Light',
  })

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
    'Head Chef': 5,
    'Sous Chef': 6,
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
  const filteredPrepItems = visiblePrepItems.filter((item) => {
    const query = prepSearchQuery.trim().toLowerCase()
    const matchesQuery = !query || item.name.toLowerCase().includes(query)
    const matchesStation = prepStationFilter === 'All' || item.station === prepStationFilter

    return matchesQuery && matchesStation
  })

  const filteredInventoryItems = inventoryItems.filter((item) => {
    const query = inventorySearchQuery.trim().toLowerCase()
    const status = getInventoryStatus(item.quantity, item.threshold)
    const matchesQuery = !query || item.name.toLowerCase().includes(query)
    const matchesStatus = inventoryStatusFilter === 'All' || status === inventoryStatusFilter

    return matchesQuery && matchesStatus
  })

  const activeStations = stationSummaries.filter((station) => station.activeTasks > 0).length
  const dateLabel = formatDate.format(new Date())
  const filteredAuditEntries = auditEntries.filter(
    (entry) => auditFilter === 'All' || entry.category === auditFilter,
  )
  const isFirstRun =
    prepItems.length === 0 &&
    inventoryItems.length === 0 &&
    eightySixItems.length === 0 &&
    shiftNotes.length === 0 &&
    auditEntries.length === 0

  const selectedStationPrepItems = selectedStation
    ? prepItems.filter((item) => item.station === selectedStation)
    : []
  const selectedStationButtonId = selectedStation
    ? getStationDomId(selectedStation)
    : undefined

  const announceAction = (message: string) => {
    setActionAnnouncement('')
    window.setTimeout(() => {
      setActionAnnouncement(message)
    }, 0)
  }

  const queueUndoAction = (message: string, onUndo: () => void) => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current)
    }

    setUndoState({ message, onUndo })
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoState(null)
      undoTimeoutRef.current = null
    }, 8000)
  }

  const handleUndoAction = () => {
    if (!undoState) {
      return
    }

    undoState.onUndo()
    setUndoState(null)
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
    announceAction('Last action undone.')
  }

  const jumpToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId)
    window.location.hash = sectionId
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

  const addAuditEntry = (category: AuditEntry['category'], message: string) => {
    setAuditEntries((currentEntries) => [
      {
        id: createRuntimeId('audit'),
        category,
        message,
        timestamp: formatCurrentTime(),
      },
      ...currentEntries,
    ].slice(0, 12))
  }

  const clearInventoryQuantityDraft = (itemId: string) => {
    setInventoryQuantityDrafts((currentDrafts) => {
      if (!(itemId in currentDrafts)) {
        return currentDrafts
      }

      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[itemId]
      return nextDrafts
    })
  }

  const handleInventoryQuantityInputChange = (itemId: string, value: string) => {
    if (!/^\d*$/.test(value)) {
      return
    }

    setInventoryQuantityDrafts((currentDrafts) => ({
      ...currentDrafts,
      [itemId]: value,
    }))
  }

  const commitInventoryQuantityInput = (itemId: string) => {
    const draftValue = inventoryQuantityDrafts[itemId]
    if (draftValue === undefined) {
      return
    }

    if (draftValue === '') {
      clearInventoryQuantityDraft(itemId)
      return
    }

    updateInventoryQuantity(itemId, Number(draftValue))
    clearInventoryQuantityDraft(itemId)
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.auditEntries, JSON.stringify(auditEntries))
    }
  }, [auditEntries])

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

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
    addAuditEntry('Prep', `${name} added for ${newPrepStation} with ${newPrepPriority.toLowerCase()} priority.`)
    announceAction(`${name} added to prep for ${newPrepStation}.`)
  }

  const updateInventoryQuantity = (itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0

    const targetItem = inventoryItems.find((item) => item.id === itemId)
    if (!targetItem || targetItem.quantity === safeQuantity) {
      return
    }

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

    clearInventoryQuantityDraft(itemId)
    addAuditEntry('Inventory', `${targetItem.name} quantity updated to ${safeQuantity} ${targetItem.unit}.`)
  }

  const handleAddInventoryItem = () => {
    const name = newInventoryName.trim()
    const quantity = Math.max(0, Math.floor(Number(newInventoryQuantity)))
    const threshold = Math.max(1, Math.floor(Number(newInventoryThreshold)))
    const unit = newInventoryUnit.trim() || 'count'

    if (!name || !Number.isFinite(quantity) || !Number.isFinite(threshold)) {
      setInventoryFormError('Enter a valid item name, quantity, and threshold before saving.')
      return
    }

    setInventoryFormError('')
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
    addAuditEntry('Inventory', `${name} added with ${quantity} ${unit} and threshold ${threshold}.`)
    announceAction(`${name} added to inventory.`)
  }

  const startEditingInventoryItem = (item: InventoryItem) => {
    setEditingInventoryItemId(item.id)
    setEditingInventoryName(item.name)
    setEditingInventoryUnit(item.unit)
    setEditingInventoryThreshold(String(item.threshold))
    setEditingInventoryError('')
  }

  const cancelEditingInventoryItem = () => {
    setEditingInventoryItemId(null)
    setEditingInventoryName('')
    setEditingInventoryUnit('count')
    setEditingInventoryThreshold('1')
    setEditingInventoryError('')
  }

  const handleSaveInventoryItem = (itemId: string) => {
    const name = editingInventoryName.trim()
    const unit = editingInventoryUnit.trim() || 'count'
    const threshold = Math.max(1, Math.floor(Number(editingInventoryThreshold)))
    const targetItem = inventoryItems.find((item) => item.id === itemId)

    if (!name || !Number.isFinite(threshold)) {
      setEditingInventoryError('Item name and threshold must be valid before saving changes.')
      return
    }

    if (!targetItem) {
      return
    }

    setEditingInventoryError('')

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

    addAuditEntry(
      'Inventory',
      `${targetItem.name} updated to ${name}, unit ${unit}, threshold ${threshold}.`,
    )
    cancelEditingInventoryItem()
    announceAction(`${name} inventory details updated.`)
  }

  const handleRemoveInventoryItem = (itemId: string) => {
    const targetItem = inventoryItems.find((item) => item.id === itemId)
    const targetIndex = inventoryItems.findIndex((item) => item.id === itemId)

    if (!targetItem || !window.confirm(`Remove ${targetItem.name} from inventory?`)) {
      return
    }

    setInventoryItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    if (editingInventoryItemId === itemId) {
      cancelEditingInventoryItem()
    }

    addShiftNote('Expo', `Inventory removed: ${targetItem.name} was taken off the watchlist.`)
    addAuditEntry('Inventory', `${targetItem.name} removed from inventory.`)
    announceAction(`${targetItem.name} removed from inventory.`)
    queueUndoAction(`${targetItem.name} removed from inventory.`, () => {
      setInventoryItems((currentItems) => {
        if (currentItems.some((item) => item.id === targetItem.id)) {
          return currentItems
        }

        const nextItems = [...currentItems]
        const insertIndex = Math.min(Math.max(targetIndex, 0), nextItems.length)
        nextItems.splice(insertIndex, 0, targetItem)
        return nextItems
      })

      addAuditEntry('Inventory', `${targetItem.name} removal undone.`)
    })
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
      addAuditEntry('Prep', `${targetItem.name} marked ready on ${targetItem.station}.`)

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
    const targetIndex = eightySixItems.findIndex((entry) => entry.id === itemId)
    if (!targetItem || !window.confirm(`Resolve ${targetItem.item} and remove it from menu changes?`)) {
      return
    }

    setEightySixItems((currentItems) => currentItems.filter((entry) => entry.id !== itemId))
    announceAction(`${targetItem.item} removed from 86'd items.`)
    queueUndoAction(`${targetItem.item} removed from menu changes.`, () => {
      setEightySixItems((currentItems) => {
        if (currentItems.some((entry) => entry.id === targetItem.id)) {
          return currentItems
        }

        const nextItems = [...currentItems]
        const insertIndex = Math.min(Math.max(targetIndex, 0), nextItems.length)
        nextItems.splice(insertIndex, 0, targetItem)
        return nextItems
      })
    })
  }

  const handleClearEightySixItems = () => {
    if (!window.confirm("Clear all 86'd items?")) {
      return
    }

    const previousItems = eightySixItems

    setEightySixItems([])
    setIsEightySixFormOpen(false)
    announceAction("All 86'd items cleared.")
    queueUndoAction("All 86'd items cleared.", () => {
      setEightySixItems(previousItems)
    })
  }

  const handleClearAuditEntries = () => {
    if (!window.confirm('Clear the activity log?')) {
      return
    }

    const previousEntries = auditEntries
    const previousFilter = auditFilter

    setAuditEntries([])
    setAuditFilter('All')
    announceAction('Activity log cleared.')
    queueUndoAction('Activity log cleared.', () => {
      setAuditEntries(previousEntries)
      setAuditFilter(previousFilter)
    })
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

        {isFirstRun && (
          <section className="onboarding-card" aria-label="First run setup">
            <p className="eyebrow">Quick setup</p>
            <h3>Start your shift in under a minute</h3>
            <p>Add your first prep item, inventory watch item, and menu change to activate the dashboard.</p>
            <div className="onboarding-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsPrepFormOpen(true)
                  jumpToSection('prep-board')
                }}
              >
                Add first prep item
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsInventoryFormOpen(true)
                  jumpToSection('inventory')
                }}
              >
                Add first inventory item
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsEightySixFormOpen(true)
                  jumpToSection('eighty-six')
                }}
              >
                Add first menu change
              </button>
            </div>
          </section>
        )}

        {undoState && (
          <div className="undo-toast" role="status" aria-live="polite">
            <span>{undoState.message}</span>
            <button className="secondary-button" type="button" onClick={handleUndoAction}>
              Undo
            </button>
          </div>
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

              <div className="panel-toolbar" role="group" aria-label="Filter prep items">
                <input
                  className="toolbar-input"
                  value={prepSearchQuery}
                  onChange={(event) => setPrepSearchQuery(event.target.value)}
                  placeholder="Search prep items"
                  aria-label="Search prep items"
                />
                <select
                  className="toolbar-select"
                  value={prepStationFilter}
                  onChange={(event) => setPrepStationFilter(event.target.value as PrepStationFilter)}
                  aria-label="Filter prep by station"
                >
                  <option value="All">All stations</option>
                  {stationNames.map((stationName) => (
                    <option key={stationName} value={stationName}>
                      {stationName}
                    </option>
                  ))}
                </select>
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
                <div className="empty-state">
                  <p className="prep-empty">No open prep items yet. Add one to get started.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setIsPrepFormOpen(true)}
                  >
                    Add prep item
                  </button>
                </div>
              ) : filteredPrepItems.length === 0 ? (
                <p className="prep-empty">No prep items match your search or station filter.</p>
              ) : (
                filteredPrepItems.map((item) => (
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
                  onClick={() => {
                    setInventoryFormError('')
                    setIsInventoryFormOpen((isOpen) => !isOpen)
                  }}
                >
                  {isInventoryFormOpen ? 'Cancel Item' : 'Add Inventory Item'}
                </button>
              </div>

              <div className="panel-toolbar" role="group" aria-label="Filter inventory items">
                <input
                  className="toolbar-input"
                  value={inventorySearchQuery}
                  onChange={(event) => setInventorySearchQuery(event.target.value)}
                  placeholder="Search inventory"
                  aria-label="Search inventory items"
                />
                <select
                  className="toolbar-select"
                  value={inventoryStatusFilter}
                  onChange={(event) => setInventoryStatusFilter(event.target.value as InventoryStatusFilter)}
                  aria-label="Filter inventory by status"
                >
                  <option value="All">All statuses</option>
                  <option value="OK">OK</option>
                  <option value="Low">Low</option>
                  <option value="Critical">Critical</option>
                </select>
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

                  {inventoryFormError && (
                    <p className="form-error" role="alert">
                      {inventoryFormError}
                    </p>
                  )}
                </form>
              )}

              {inventoryItems.length === 0 ? (
                <div className="empty-state">
                  <p className="prep-empty">No inventory items yet. Add stock to start tracking alerts.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setIsInventoryFormOpen(true)}
                  >
                    Add inventory item
                  </button>
                </div>
              ) : filteredInventoryItems.length === 0 ? (
                <p className="prep-empty">No inventory items match your search or status filter.</p>
              ) : (
                filteredInventoryItems.map((item) => (
                <article className="inventory-item" key={item.id}>
                  {(() => {
                    const draftQuantity = inventoryQuantityDrafts[item.id]
                    const stepperQuantity =
                      draftQuantity !== undefined && draftQuantity !== ''
                        ? Number(draftQuantity)
                        : item.quantity

                    return (
                      <>
                    <div className="inventory-item-main">
                      {editingInventoryItemId === item.id ? (
                        <div className="inventory-edit-fields">
                          <label>
                            Item
                            <input
                              value={editingInventoryName}
                              onChange={(event) => {
                                setEditingInventoryName(event.target.value)
                                if (editingInventoryError) {
                                  setEditingInventoryError('')
                                }
                              }}
                              required
                            />
                          </label>
                          <label>
                            Unit
                            <input
                              value={editingInventoryUnit}
                              onChange={(event) => {
                                setEditingInventoryUnit(event.target.value)
                                if (editingInventoryError) {
                                  setEditingInventoryError('')
                                }
                              }}
                              required
                            />
                          </label>
                          <label>
                            Threshold
                            <input
                              type="number"
                              min={1}
                              value={editingInventoryThreshold}
                              onChange={(event) => {
                                setEditingInventoryThreshold(event.target.value)
                                if (editingInventoryError) {
                                  setEditingInventoryError('')
                                }
                              }}
                              required
                            />
                          </label>
                          {editingInventoryError && (
                            <p className="form-error inventory-edit-error" role="alert">
                              {editingInventoryError}
                            </p>
                          )}
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
                      onClick={() => updateInventoryQuantity(item.id, stepperQuantity - 1)}
                      aria-label={`Decrease ${item.name} count`}
                    >
                      -
                    </button>
                    <input
                      className="inventory-input"
                      type="number"
                      min={0}
                        inputMode="numeric"
                        value={draftQuantity ?? String(item.quantity)}
                      onChange={(event) => handleInventoryQuantityInputChange(item.id, event.target.value)}
                        onBlur={() => commitInventoryQuantityInput(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitInventoryQuantityInput(item.id)
                          }

                          if (event.key === 'Escape') {
                            clearInventoryQuantityDraft(item.id)
                          }
                        }}
                      aria-label={`${item.name} count`}
                    />
                    <button
                      className="inventory-stepper"
                      type="button"
                      onClick={() => updateInventoryQuantity(item.id, stepperQuantity + 1)}
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
                      </>
                    )
                  })()}
                </article>
                ))
              )}
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
                <div className="empty-state">
                  <p className="prep-empty">No menu changes posted yet.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setIsEightySixFormOpen(true)}
                  >
                    Add menu change
                  </button>
                </div>
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
                    id={getStationDomId(station.name)}
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
              {shiftNotes.length === 0 ? (
                <div className="empty-state">
                  <p className="prep-empty">No shift notes yet. They will appear as you update prep and inventory.</p>
                </div>
              ) : (
                shiftNotes.map((note) => (
                  <article className="note-card" key={note.id}>
                    <div className="note-meta">
                      <span>{note.station}</span>
                      <span>{note.timestamp}</span>
                    </div>
                    <p>{note.message}</p>
                  </article>
                ))
              )}

              <div className="activity-panel">
                <div className="panel-heading activity-heading">
                  <div>
                    <p className="eyebrow">Activity log</p>
                    <h3>Prep and inventory audit trail</h3>
                  </div>
                  <div className="activity-toolbar">
                    <span className="panel-badge">{filteredAuditEntries.length} events</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleClearAuditEntries}
                      disabled={auditEntries.length === 0}
                    >
                      Clear Log
                    </button>
                  </div>
                </div>

                <div className="activity-filters" role="toolbar" aria-label="Filter activity log">
                  {(['All', 'Prep', 'Inventory'] as AuditFilter[]).map((filterOption) => (
                    <button
                      key={filterOption}
                      className={`secondary-button activity-filter-button ${auditFilter === filterOption ? 'is-active' : ''}`}
                      type="button"
                      aria-pressed={auditFilter === filterOption}
                      onClick={() => setAuditFilter(filterOption)}
                    >
                      {filterOption}
                    </button>
                  ))}
                </div>

                <div className="activity-list">
                  {filteredAuditEntries.length === 0 ? (
                    <p className="prep-empty">No activity entries match the current filter.</p>
                  ) : (
                    filteredAuditEntries.map((entry) => (
                      <article className="activity-item" key={entry.id}>
                        <div className="note-meta">
                          <span>{entry.category}</span>
                          <span>{entry.timestamp}</span>
                        </div>
                        <p>{entry.message}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
          </section>
      </main>
    </div>
  )
}

export default App
