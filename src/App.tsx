import './App.css'

type PrepStatus = 'Not Started' | 'In Progress' | 'Ready'
type PrepPriority = 'Low' | 'Medium' | 'High'

type PrepItem = {
  id: string
  name: string
  station: string
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
  status: 'OK' | 'Low' | 'Critical'
}

type ShiftNote = {
  id: string
  station: string
  message: string
  timestamp: string
}

type StationStatus = {
  id: string
  name: string
  workload: 'Light' | 'Moderate' | 'Heavy'
  activeTasks: number
  readyItems: number
}

const prepItems: PrepItem[] = [
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
    station: 'Prep',
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
    name: 'Truffle fries seasoning',
    station: 'Fry',
    priority: 'Low',
    status: 'Ready',
    dueTime: '10:45 AM',
  },
]

const inventoryItems: InventoryItem[] = [
  {
    id: 'inv-1',
    name: 'Salmon portions',
    quantity: 4,
    unit: 'left',
    threshold: 6,
    status: 'Low',
  },
  {
    id: 'inv-2',
    name: 'Brioche buns',
    quantity: 12,
    unit: 'count',
    threshold: 10,
    status: 'OK',
  },
  {
    id: 'inv-3',
    name: 'Fryer oil reserve',
    quantity: 1,
    unit: 'jug',
    threshold: 2,
    status: 'Critical',
  },
]

const shiftNotes: ShiftNote[] = [
  {
    id: 'note-1',
    station: 'Expo',
    message: '86 salmon after current tickets. Push chicken feature if needed.',
    timestamp: '5:42 PM',
  },
  {
    id: 'note-2',
    station: 'Prep',
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
    name: 'Pantry',
    workload: 'Moderate',
    activeTasks: 3,
    readyItems: 4,
  },
  {
    id: 'station-3',
    name: 'Fry',
    workload: 'Light',
    activeTasks: 1,
    readyItems: 3,
  },
  {
    id: 'station-4',
    name: 'Expo',
    workload: 'Heavy',
    activeTasks: 5,
    readyItems: 0,
  },
]

const formatDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

function App() {
  const openPrepCount = prepItems.filter((item) => item.status !== 'Ready').length
  const readyPrepCount = prepItems.filter((item) => item.status === 'Ready').length
  const criticalStockCount = inventoryItems.filter((item) => item.status !== 'OK').length
  const activeStations = stationStatuses.filter((station) => station.activeTasks > 0).length
  const dateLabel = formatDate.format(new Date())

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">BOH operations</p>
          <h1 className="brand-title">LineFlow</h1>
          <p className="brand-copy">
            A live dashboard for prep visibility, low-stock awareness, and shift handoff.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard sections">
          <a className="is-active" href="#snapshot">Service Snapshot</a>
          <a href="#prep-board">Prep Board</a>
          <a href="#stations">Stations</a>
          <a href="#inventory">Inventory</a>
          <a href="#notes">Shift Notes</a>
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-label">Current shift</span>
          <strong>Dinner push</strong>
          <p>Focus on prep completion before 5:30 PM and watch critical stock counts.</p>
        </div>
      </aside>

      <main className="dashboard">
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
            <button className="action-button" type="button">
              Generate Handoff
            </button>
          </div>
        </header>

        <section id="snapshot" className="snapshot-grid" aria-label="Service snapshot">
          <article className="metric-card">
            <span className="metric-label">Open prep</span>
            <strong>{openPrepCount}</strong>
            <p>Items still in progress before service starts.</p>
          </article>
          <article className="metric-card accent-teal">
            <span className="metric-label">Ready to fire</span>
            <strong>{readyPrepCount}</strong>
            <p>Prep items completed and ready for line use.</p>
          </article>
          <article className="metric-card accent-amber">
            <span className="metric-label">Low stock alerts</span>
            <strong>{criticalStockCount}</strong>
            <p>Items that need attention before dinner rush.</p>
          </article>
          <article className="metric-card accent-coral">
            <span className="metric-label">Active stations</span>
            <strong>{activeStations}</strong>
            <p>Stations currently carrying active tasks.</p>
          </article>
        </section>

        <section className="dashboard-grid">
          <section id="prep-board" className="panel prep-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Prep board</p>
                <h3>What still needs attention</h3>
              </div>
              <span className="panel-badge">{prepItems.length} items</span>
            </div>

            <div className="prep-list">
              {prepItems.map((item) => (
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
              ))}
            </div>
          </section>

          <section id="inventory" className="panel side-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Inventory alerts</p>
                <h3>Watchlist before service</h3>
              </div>
            </div>

            <div className="inventory-list">
              {inventoryItems.map((item) => (
                <article className="inventory-item" key={item.id}>
                  <div>
                    <h4>{item.name}</h4>
                    <p>
                      {item.quantity} {item.unit} remaining · threshold {item.threshold}
                    </p>
                  </div>
                  <span className={`status-chip status-${item.status.toLowerCase()}`}>{item.status}</span>
                </article>
              ))}
            </div>
          </section>

          <section id="stations" className="panel stations-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Stations</p>
                <h3>Line health overview</h3>
              </div>
            </div>

            <div className="station-grid">
              {stationStatuses.map((station) => (
                <article className="station-card" key={station.id}>
                  <div className="station-head">
                    <h4>{station.name}</h4>
                    <span className={`load-pill load-${station.workload.toLowerCase()}`}>{station.workload}</span>
                  </div>
                  <p>{station.activeTasks} active tasks</p>
                  <p>{station.readyItems} ready items</p>
                </article>
              ))}
            </div>
          </section>

          <section id="notes" className="panel notes-panel">
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
