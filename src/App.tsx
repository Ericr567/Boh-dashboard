import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import './App.css'

type StationName = 'Grill' | 'Saute' | 'Pastry' | 'Pantry' | 'Expo' | 'Head Chef' | 'Sous Chef'

type PrepStatus = 'Queued' | 'Not Started' | 'In Progress' | 'Held' | 'Blocked' | 'Ready'
type PrepPriority = 'Low' | 'Medium' | 'High'

type PrepItem = {
  id: string
  name: string
  station: StationName
  priority: PrepPriority
  status: PrepStatus
  dueTime: string
  quantity: string
  assignee: StationName | ''
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

type UpcomingParty = {
  id: string
  name: string
  date: string
  notes: string
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
type PrepStatusFilter = 'All' | PrepStatus

type RecipeCategory = 'Sauce' | 'Protein' | 'Sides' | 'Dessert' | 'Soup' | 'Salad' | 'Bake' | 'Other'

type Recipe = {
  id: string
  name: string
  station: StationName
  category: RecipeCategory
  recipeYield: string
  prepTime: string
  ingredients: string
  instructions: string
  notes: string
}

type RecipeCategoryFilter = 'All' | RecipeCategory

type UndoState = {
  message: string
  onUndo: () => void
}

type KitchenProfile = {
  id: string
  name: string
  createdAt: string
  joinCode: string
}

type UserProfile = {
  id: string
  name: string
  role: string
  kitchenId: string | null
  createdAt: string
}

type BackupPayload = {
  version: 1
  exportedAt: string
  prepItems: PrepItem[]
  inventoryItems: InventoryItem[]
  eightySixItems: EightySixItem[]
  shiftNotes: ShiftNote[]
  auditEntries: AuditEntry[]
  recipes?: Recipe[]
}

const stationNames: StationName[] = ['Grill', 'Saute', 'Pastry', 'Pantry', 'Expo', 'Head Chef', 'Sous Chef']
const prepStatusOptions: PrepStatus[] = ['Queued', 'Not Started', 'In Progress', 'Held', 'Blocked', 'Ready']

const recipeCategories: RecipeCategory[] = ['Sauce', 'Protein', 'Sides', 'Dessert', 'Soup', 'Salad', 'Bake', 'Other']

const initialInventoryItems: InventoryItem[] = []
const initialEightySixItems: EightySixItem[] = []
const initialShiftNotes: ShiftNote[] = []
const initialUpcomingParties: UpcomingParty[] = []
const initialAuditEntries: AuditEntry[] = []

const legacySeededInventoryIds = new Set(['inv-1', 'inv-2', 'inv-3'])
const legacySeededEightySixIds = new Set(['eighty-six-1', 'eighty-six-2', 'eighty-six-3'])
const legacySeededShiftNoteIds = new Set(['note-1', 'note-2', 'note-3'])
const legacySeededAuditIds = new Set(['audit-1', 'audit-2'])

// Kitchen meta keys — not namespaced, shared across all kitchens
const kitchenMetaKeys = {
  kitchens: 'lineflow.kitchens',
  activeKitchenId: 'lineflow.activeKitchenId',
  profiles: 'lineflow.profiles',
  activeProfileId: 'lineflow.activeProfileId',
} as const

// Data keys namespaced per kitchen
const makeStorageKeys = (kitchenId: string) => ({
  prepItems: `lineflow.kitchen.${kitchenId}.prepItems`,
  inventoryItems: `lineflow.kitchen.${kitchenId}.inventoryItems`,
  eightySixItems: `lineflow.kitchen.${kitchenId}.eightySixItems`,
  shiftNotes: `lineflow.kitchen.${kitchenId}.shiftNotes`,
  upcomingParties: `lineflow.kitchen.${kitchenId}.upcomingParties`,
  auditEntries: `lineflow.kitchen.${kitchenId}.auditEntries`,
  teamSchedule: `lineflow.kitchen.${kitchenId}.teamSchedule`,
  serviceTime: `lineflow.kitchen.${kitchenId}.serviceTime`,
  recipes: `lineflow.kitchen.${kitchenId}.recipes`,
} as const)

// Legacy (pre-profile) keys — used for one-time migration
const legacyKeys = {
  prepItems: 'lineflow.prepItems',
  inventoryItems: 'lineflow.inventoryItems',
  eightySixItems: 'lineflow.eightySixItems',
  shiftNotes: 'lineflow.shiftNotes',
  auditEntries: 'lineflow.auditEntries',
  serviceTime: 'lineflow.serviceTime',
  recipes: 'lineflow.recipes',
} as const

const migrateToKitchen = (kitchenId: string) => {
  const keys = makeStorageKeys(kitchenId)
  const legacyEntries = Object.entries(legacyKeys) as [keyof typeof legacyKeys, string][]
  for (const [field, legacyKey] of legacyEntries) {
    const existing = window.localStorage.getItem(legacyKey)
    if (existing !== null && window.localStorage.getItem(keys[field]) === null) {
      window.localStorage.setItem(keys[field], existing)
    }
  }
}

let fallbackIdCounter = 0

const createRuntimeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  fallbackIdCounter += 1
  return `${prefix}-${fallbackIdCounter}`
}

const generateJoinCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
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

const isPrepStatus = (value: unknown): value is PrepStatus =>
  value === 'Queued' || value === 'Not Started' || value === 'In Progress' || value === 'Held' || value === 'Blocked' || value === 'Ready'

const isPrepPriority = (value: unknown): value is PrepPriority =>
  value === 'Low' || value === 'Medium' || value === 'High'

const normalizeImportedPrepItems = (value: unknown): PrepItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const item = entry as Record<string, unknown>
      if (typeof item.name !== 'string' || typeof item.dueTime !== 'string') {
        return null
      }

      return {
        id: typeof item.id === 'string' ? item.id : createRuntimeId('prep'),
        name: item.name,
        station: normalizeStationName(item.station, 'Pantry'),
        priority: isPrepPriority(item.priority) ? item.priority : 'Medium',
        status: isPrepStatus(item.status) ? item.status : 'Not Started',
        dueTime: item.dueTime,
        quantity: typeof item.quantity === 'string' ? item.quantity : '',
        assignee: stationNames.includes(item.assignee as StationName) ? item.assignee as StationName : '',
      }
    })
    .filter((item): item is PrepItem => item !== null)
}

const parseDueTime = (dueTime: string): number | null => {
  if (!dueTime || typeof dueTime !== 'string') {
    return null
  }

  const match = dueTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) {
    return null
  }

  let hour = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  const period = match[3]?.toUpperCase()

  if (period === 'AM' && hour === 12) {
    hour = 0
  } else if (period === 'PM' && hour !== 12) {
    hour += 12
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minutes)) {
    return null
  }

  return hour * 60 + minutes
}

const getPrepUrgency = (item: PrepItem, now = new Date()): 'Overdue' | 'Due soon' | 'On track' => {
  if (item.status === 'Ready' || item.status === 'Blocked') {
    return item.status === 'Blocked' ? 'Due soon' : 'On track'
  }

  const dueMinutes = parseDueTime(item.dueTime)
  if (dueMinutes === null) {
    return 'On track'
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const thresholdMinutes = dueMinutes - 45

  if (currentMinutes > dueMinutes) {
    return 'Overdue'
  }

  if (currentMinutes >= thresholdMinutes) {
    return 'Due soon'
  }

  return 'On track'
}

const isBackupPayload = (value: unknown): value is BackupPayload => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const backup = value as Record<string, unknown>
  return backup.version === 1
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
    .filter(
      (note): note is ShiftNote =>
        note !== null &&
        !legacySeededShiftNoteIds.has(note.id) &&
        !note.message.startsWith('Inventory '),
    )
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

const loadStoredRecipes = (value: unknown): Recipe[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const r = entry as Record<string, unknown>
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return null
      return {
        id: r.id,
        name: r.name,
        station: normalizeStationName(r.station, 'Pantry'),
        category: recipeCategories.includes(r.category as RecipeCategory) ? r.category as RecipeCategory : 'Other',
        recipeYield: typeof r.recipeYield === 'string' ? r.recipeYield : '',
        prepTime: typeof r.prepTime === 'string' ? r.prepTime : '',
        ingredients: typeof r.ingredients === 'string' ? r.ingredients : '',
        instructions: typeof r.instructions === 'string' ? r.instructions : '',
        notes: typeof r.notes === 'string' ? r.notes : '',
      }
    })
    .filter((r): r is Recipe => r !== null)
}

const loadStoredTeamSchedule = (value: unknown): TeamShiftEntry[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      if (typeof item.profileId !== 'string') return null
      return {
        profileId: item.profileId,
        inTime: typeof item.inTime === 'string' ? item.inTime : '',
        outTime: typeof item.outTime === 'string' ? item.outTime : '',
        clockedIn: Boolean(item.clockedIn),
      }
    })
    .filter((entry): entry is TeamShiftEntry => entry !== null)
}

const loadStoredUpcomingParties = (value: unknown): UpcomingParty[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.date !== 'string') return null
      return {
        id: item.id,
        name: item.name,
        date: item.date,
        notes: typeof item.notes === 'string' ? item.notes : '',
      }
    })
    .filter((entry): entry is UpcomingParty => entry !== null)
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
  'upcoming-parties': 'Upcoming Parties',
  notes: 'Shift Notes',
  recipes: 'Recipe Book',
} as const

type SectionId = keyof typeof sectionLabels
const sectionIds = Object.keys(sectionLabels) as SectionId[]

const sectionShortLabels: Record<SectionId, string> = {
  snapshot: 'Home',
  'prep-board': 'Prep',
  stations: 'Stations',
  inventory: 'Stock',
  'eighty-six': "86'd",
  'upcoming-parties': 'Parties',
  notes: 'Notes',
  recipes: 'Recipes',
}

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

type DashboardRange = 'Day' | 'Week' | 'Month'
type DashboardView = 'Manager' | 'Staff'
type TeamStatus = 'Clocked In' | 'On Time' | 'Late' | 'Off Today'

type TeamMember = {
  name: string
  role: string
  shift: string
  status: TeamStatus
}

type TeamShiftEntry = {
  profileId: string
  inTime: string
  outTime: string
  clockedIn: boolean
}

const businessMetricsByRange: Record<
  DashboardRange,
  {
    sales: string
    salesDelta: string
    laborCost: string
    laborHours: string
    overtimeRisk: string
    forecast: string
    trendLabels: string[]
    trendValues: number[]
  }
> = {
  Day: {
    sales: '$12.4k',
    salesDelta: '+6.2%',
    laborCost: '22.8%',
    laborHours: '94 hrs',
    overtimeRisk: '1 teammate',
    forecast: '94%',
    trendLabels: ['10a', '12p', '2p', '4p', '6p', '8p'],
    trendValues: [38, 64, 52, 70, 92, 78],
  },
  Week: {
    sales: '$84.7k',
    salesDelta: '+9.4%',
    laborCost: '24.1%',
    laborHours: '612 hrs',
    overtimeRisk: '2 teammates',
    forecast: '97%',
    trendLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    trendValues: [54, 62, 58, 71, 88, 96, 74],
  },
  Month: {
    sales: '$341k',
    salesDelta: '+12.1%',
    laborCost: '23.4%',
    laborHours: '2,448 hrs',
    overtimeRisk: '3 teammates',
    forecast: '101%',
    trendLabels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'],
    trendValues: [68, 74, 82, 95],
  },
}

const fallbackLowStockWarnings: { name: string; status: 'Critical' | 'Low'; detail: string }[] = []

const fallbackTaskStatus = [
  { label: 'Line check complete', detail: 'Opening checklist', progress: 100, status: 'Ready' as PrepStatus },
  { label: 'Sauce par prep', detail: 'Pantry • due 2:00 PM', progress: 82, status: 'In Progress' as PrepStatus },
  { label: 'Protein pull', detail: 'Grill • due 3:15 PM', progress: 56, status: 'In Progress' as PrepStatus },
  { label: 'Dessert plating setup', detail: 'Pastry • due 4:00 PM', progress: 22, status: 'Not Started' as PrepStatus },
]

function Dashboard({
  kitchenId,
  kitchens,
  profiles,
  onManageKitchens,
  activeProfileName,
  onSwitchProfile,
  onAddTeamMemberToKitchen,
}: {
  kitchenId: string
  kitchens: KitchenProfile[]
  profiles: UserProfile[]
  onManageKitchens: () => void
  activeProfileName: string
  onSwitchProfile: () => void
  onAddTeamMemberToKitchen: (profileId: string, kitchenId: string) => void
}) {
  const storageKeys = makeStorageKeys(kitchenId)
  const activeKitchen = kitchens.find((k) => k.id === kitchenId)

  const [teamShiftEntries, setTeamShiftEntries] = useState<TeamShiftEntry[]>(() =>
    loadStoredState(storageKeys.teamSchedule, [], loadStoredTeamSchedule),
  )

  const teamRosterMembers = profiles
    .filter((profile) => profile.kitchenId === kitchenId)
    .map((profile) => {
      const shiftEntry = teamShiftEntries.find((entry) => entry.profileId === profile.id)
      const clockedIn = shiftEntry?.clockedIn ?? false
      return {
        profileId: profile.id,
        name: profile.name,
        role: profile.role,
        shift: clockedIn ? `${shiftEntry?.inTime || '—'} – ${shiftEntry?.outTime || '—'}` : 'No shift',
        status: clockedIn ? 'Clocked In' : 'Off Today',
        inTime: shiftEntry?.inTime ?? '',
        outTime: shiftEntry?.outTime ?? '',
        clockedIn,
      }
    })
  const kitchenTeamMembers: TeamMember[] = teamRosterMembers.map(({ name, role, shift, status }) => ({
    name,
    role,
    shift,
    status: status as TeamStatus,
  }))
  const signedInTeamMembers = teamRosterMembers.filter((member) => member.clockedIn)

  const [teamMemberToAddId, setTeamMemberToAddId] = useState('')
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
  const [upcomingParties, setUpcomingParties] = useState<UpcomingParty[]>(() =>
    loadStoredState(storageKeys.upcomingParties, initialUpcomingParties, loadStoredUpcomingParties),
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
  const [newPartyName, setNewPartyName] = useState('')
  const [newPartyDate, setNewPartyDate] = useState('')
  const [newPartyNotes, setNewPartyNotes] = useState('')
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
  const [prepStatusFilter, setPrepStatusFilter] = useState<PrepStatusFilter>('All')
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<InventoryStatusFilter>('All')
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const [backupError, setBackupError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [selectedPrepIds, setSelectedPrepIds] = useState<Set<string>>(new Set())
  const [newPrepQuantity, setNewPrepQuantity] = useState('')
  const [newPrepAssignee, setNewPrepAssignee] = useState<StationName | ''>('')
  const [serviceTime, setServiceTime] = useState<string>(() => {
    if (typeof window === 'undefined') return '17:30'
    try {
      return window.localStorage.getItem(makeStorageKeys(kitchenId).serviceTime) ?? '17:30'
    } catch {
      return '17:30'
    }
  })
  const [totalReservations, setTotalReservations] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    try {
      const raw = window.localStorage.getItem(`${makeStorageKeys(kitchenId).serviceTime}-reservations`)
      const value = Number(raw ?? '0')
      return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    } catch {
      return 0
    }
  })
  const [isEditingServiceTime, setIsEditingServiceTime] = useState(false)
  const [serviceTimeDraft, setServiceTimeDraft] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    loadStoredState(storageKeys.recipes, [], loadStoredRecipes),
  )
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false)
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [newRecipeName, setNewRecipeName] = useState('')
  const [newRecipeStation, setNewRecipeStation] = useState<StationName>('Pantry')
  const [newRecipeCategory, setNewRecipeCategory] = useState<RecipeCategory>('Other')
  const [newRecipeYield, setNewRecipeYield] = useState('')
  const [newRecipePrepTime, setNewRecipePrepTime] = useState('')
  const [newRecipeIngredients, setNewRecipeIngredients] = useState('')
  const [newRecipeInstructions, setNewRecipeInstructions] = useState('')
  const [newRecipeNotes, setNewRecipeNotes] = useState('')
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('')
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState<RecipeCategoryFilter>('All')
  const [recipeStationFilter, setRecipeStationFilter] = useState<PrepStationFilter>('All')
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>('Week')
  const [dashboardView, setDashboardView] = useState<DashboardView>('Staff')
  const [isDarkMode, setIsDarkMode] = useState(true)
  const undoTimeoutRef = useRef<number | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)

  const openPrepCount = prepItems.filter((item) => item.status !== 'Ready').length
  const readyPrepCount = prepItems.filter((item) => item.status === 'Ready').length
  const criticalStockCount = inventoryItems.filter(
    (item) => item.quantity > 0 && getInventoryStatus(item.quantity, item.threshold) !== 'OK',
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
    const matchesStatus = prepStatusFilter === 'All' || item.status === prepStatusFilter

    return matchesQuery && matchesStation && matchesStatus
  })

  const filteredInventoryItems = inventoryItems.filter((item) => {
    const query = inventorySearchQuery.trim().toLowerCase()
    const status = getInventoryStatus(item.quantity, item.threshold)
    const matchesQuery = !query || item.name.toLowerCase().includes(query)
    const matchesStatus = inventoryStatusFilter === 'All' || status === inventoryStatusFilter

    return matchesQuery && matchesStatus
  })

  const activeStations = stationSummaries.filter((station) => station.activeTasks > 0).length
  const dateLabel = formatDate.format(now)
  const getShiftLabel = (hour: number): string => {
    if (hour < 6) return 'Early morning'
    if (hour < 12) return 'Morning prep'
    if (hour < 16) return 'Afternoon prep'
    if (hour < 17) return 'Happy hour'
    if (hour < 18) return 'Happy hour & service'
    if (hour < 22) return 'Dinner service'
    return 'Closing'
  }
  const shiftLabel = getShiftLabel(now.getHours())
  const isPreServiceUrgent = now.getHours() >= 16
  const countdown = (() => {
    const parts = serviceTime.split(':')
    const h = parseInt(parts[0] ?? '', 10)
    const m = parseInt(parts[1] ?? '', 10)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    const service = new Date(now)
    service.setHours(h, m, 0, 0)
    const diffMs = service.getTime() - now.getTime()
    if (diffMs <= 0) return null
    const totalMinutes = Math.floor(diffMs / 60_000)
    const hrs = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return { totalMinutes, hrs, mins }
  })()
  const filteredAuditEntries = auditEntries.filter(
    (entry) => auditFilter === 'All' || entry.category === auditFilter,
  )

  const filteredRecipes = recipes.filter((r) => {
    const q = recipeSearchQuery.trim().toLowerCase()
    const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.ingredients.toLowerCase().includes(q)
    const matchesCategory = recipeCategoryFilter === 'All' || r.category === recipeCategoryFilter
    const matchesStation = recipeStationFilter === 'All' || r.station === recipeStationFilter
    return matchesQuery && matchesCategory && matchesStation
  })
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

  const selectedMetrics = businessMetricsByRange[dashboardRange]
  const positiveAttendanceCount = signedInTeamMembers.length
  const lowStockWarnings = inventoryItems.length > 0
    ? inventoryItems
        .filter((item) => item.quantity > 0 && getInventoryStatus(item.quantity, item.threshold) !== 'OK')
        .slice(0, 4)
        .map((item) => ({
          name: item.name,
          status: getInventoryStatus(item.quantity, item.threshold),
          detail: `${item.quantity} ${item.unit} left`,
        }))
    : fallbackLowStockWarnings
  const visibleLowStockCount = inventoryItems.some((item) => item.quantity > 0)
    ? criticalStockCount
    : 0
  const totalTrackedTasks = visiblePrepItems.length > 0 ? visiblePrepItems.length : prepItems.length > 0 ? prepItems.length : 9
  const completedTrackedTasks = visiblePrepItems.length > 0 ? visiblePrepItems.filter((item) => item.status === 'Ready').length : prepItems.length > 0 ? readyPrepCount : 7
  const completionRate = Math.round((completedTrackedTasks / totalTrackedTasks) * 100)
  const managerTaskStatusItems = prepItems.length > 0
    ? prepItems.slice(0, 4).map((item) => ({
        label: item.name,
        detail: `${item.station} • due ${item.dueTime}`,
        progress: item.status === 'Ready' ? 100 : item.status === 'In Progress' ? 64 : 24,
        status: item.status,
      }))
    : fallbackTaskStatus
  const sortedStaffFocusPrepItems = [...visiblePrepItems].sort((leftItem, rightItem) => {
    const stationDifference = stationOrder[leftItem.station] - stationOrder[rightItem.station]
    if (stationDifference !== 0) {
      return stationDifference
    }

    const urgencyOrder: Record<'Overdue' | 'Due soon' | 'On track', number> = {
      Overdue: 0,
      'Due soon': 1,
      'On track': 2,
    }

    const leftUrgency = getPrepUrgency(leftItem, now)
    const rightUrgency = getPrepUrgency(rightItem, now)
    const urgencyDifference = urgencyOrder[leftUrgency] - urgencyOrder[rightUrgency]
    if (urgencyDifference !== 0) {
      return urgencyDifference
    }

    const leftDueMinutes = parseDueTime(leftItem.dueTime) ?? Number.MAX_SAFE_INTEGER
    const rightDueMinutes = parseDueTime(rightItem.dueTime) ?? Number.MAX_SAFE_INTEGER
    if (leftDueMinutes !== rightDueMinutes) {
      return leftDueMinutes - rightDueMinutes
    }

    const priorityDifference = priorityScore[rightItem.priority] - priorityScore[leftItem.priority]
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    return leftItem.name.localeCompare(rightItem.name)
  })
  const staffFocusTaskStatusItems = sortedStaffFocusPrepItems.slice(0, 4).map((item) => ({
    label: item.name,
    detail: `${item.station} • due ${item.dueTime}${item.quantity ? ` • ${item.quantity} on hand` : ''}`,
    progress: item.status === 'Ready' ? 100 : item.status === 'In Progress' ? 64 : 24,
    status: item.status,
    priority: item.priority,
  }))
  const staffOnShiftCount = signedInTeamMembers.length
  const lateAttendanceCount = 0
  const urgentPrepCount = visiblePrepItems.filter((item) => item.priority === 'High').length
  const blockedPrepCount = visiblePrepItems.filter((item) => item.status === 'Blocked').length
  const overduePrepCount = visiblePrepItems.filter((item) => getPrepUrgency(item, now) === 'Overdue').length
  const recommendedReorders = inventoryItems
    .filter((item) => item.quantity > 0 && getInventoryStatus(item.quantity, item.threshold) !== 'OK')
    .map((item) => ({
      name: item.name,
      status: getInventoryStatus(item.quantity, item.threshold),
      quantity: item.quantity,
      threshold: item.threshold,
      unit: item.unit,
      reorderQty: Math.max(item.threshold * 2, 1),
    }))
    .slice(0, 3)

  const updateTeamShiftEntry = (profileId: string, field: 'inTime' | 'outTime' | 'clockedIn', value: string | boolean) => {
    setTeamShiftEntries((currentEntries) => {
      const existing = currentEntries.find((entry) => entry.profileId === profileId)
      const nextEntry: TeamShiftEntry = existing
        ? {
            ...existing,
            inTime: field === 'inTime' ? String(value) : existing.inTime,
            outTime: field === 'outTime' ? String(value) : existing.outTime,
            clockedIn: field === 'clockedIn' ? Boolean(value) : existing.clockedIn,
          }
        : {
            profileId,
            inTime: field === 'inTime' ? String(value) : '',
            outTime: field === 'outTime' ? String(value) : '',
            clockedIn: field === 'clockedIn' ? Boolean(value) : false,
          }

      if (existing) {
        return currentEntries.map((entry) => entry.profileId === profileId ? nextEntry : entry)
      }

      return [...currentEntries, nextEntry]
    })
  }

  const toggleShiftSignedIn = (profileId: string) => {
    const existing = teamShiftEntries.find((entry) => entry.profileId === profileId)
    const nextClockedIn = !(existing?.clockedIn ?? false)
    updateTeamShiftEntry(profileId, 'clockedIn', nextClockedIn)
  }

  const clearAllStaffOffShift = () => {
    setTeamShiftEntries((currentEntries) =>
      currentEntries.map((entry) => ({
        ...entry,
        clockedIn: false,
      })),
    )
  }

  const addableTeamMembers = profiles.filter((profile) => profile.kitchenId !== kitchenId)

  const handleAddTeamMemberToKitchen = () => {
    if (!teamMemberToAddId) {
      return
    }

    onAddTeamMemberToKitchen(teamMemberToAddId, kitchenId)
    setTeamMemberToAddId('')
  }

  const dashboardHeroTitle =
    dashboardView === 'Manager'
      ? 'Manager dashboard for sales, labor, staffing, and service control'
      : 'Staff dashboard for prep priorities, coverage, and shift focus'
  const dashboardHeroSummary =
    dashboardView === 'Manager'
      ? `${selectedMetrics.sales} in tracked sales, ${selectedMetrics.laborCost} labor, and ${visibleLowStockCount} stock warning${visibleLowStockCount === 1 ? '' : 's'} need review.`
      : `${openPrepCount} open prep item${openPrepCount === 1 ? '' : 's'}, ${urgentPrepCount} urgent task${urgentPrepCount === 1 ? '' : 's'}, and ${readyPrepCount} ready-to-fire item${readyPrepCount === 1 ? '' : 's'} for the shift.`

  const serviceAlerts = [
    ...visiblePrepItems
      .filter((item) => item.status === 'Blocked' || getPrepUrgency(item, now) === 'Overdue')
      .slice(0, 3)
      .map((item) => `${item.name} needs attention on ${item.station}`),
    ...recommendedReorders.slice(0, 2).map((item) => `${item.name} is below reorder point`),
  ].slice(0, 4)

  const snapshotCards = dashboardView === 'Manager'
    ? [
        {
          label: 'Net sales',
          value: selectedMetrics.sales,
          detail: `${selectedMetrics.salesDelta} versus the previous ${dashboardRange.toLowerCase()}.`,
          className: 'accent-teal',
        },
        {
          label: 'Labor cost',
          value: selectedMetrics.laborCost,
          detail: `${selectedMetrics.laborHours} scheduled with ${selectedMetrics.overtimeRisk} at risk.`,
          className: '',
        },
        {
          label: 'Task completion',
          value: `${completionRate}%`,
          detail: `${completedTrackedTasks} of ${totalTrackedTasks} tracked BOH tasks completed.`,
          className: 'accent-amber',
        },
        {
          label: 'Staff attendance',
          value: `${positiveAttendanceCount}/${kitchenTeamMembers.length}`,
          detail: `${lateAttendanceCount} late and ${staffOnShiftCount} currently on shift.`,
          className: 'accent-coral',
        },
      ]
    : [
        {
          label: 'Open tasks',
          value: String(openPrepCount),
          detail: 'Prep items still waiting on the line.',
          className: 'accent-teal',
        },
        {
          label: 'Urgent prep',
          value: String(urgentPrepCount),
          detail: 'High-priority items due before service.',
          className: 'accent-coral',
        },
        {
          label: 'Ready to fire',
          value: String(readyPrepCount),
          detail: 'Completed prep ready for the next push.',
          className: '',
        },
        {
          label: 'Low stock',
          value: String(visibleLowStockCount),
          detail: 'Watch these products during the shift.',
          className: 'accent-amber',
        },
      ]

  const prepTolerance = totalReservations > 0 ? Math.round(totalReservations * 0.15) : 0
  const prepLowerBound = totalReservations > 0 ? Math.max(0, totalReservations - prepTolerance) : 0
  const prepUpperBound = totalReservations > 0 ? totalReservations + prepTolerance : 0
  const currentPrepLoad = visiblePrepItems.length

  let prepTargetStatus = 'On target'
  if (totalReservations > 0) {
    if (currentPrepLoad >= prepLowerBound && currentPrepLoad <= prepUpperBound) {
      prepTargetStatus = 'On target'
    } else if (currentPrepLoad < prepLowerBound) {
      prepTargetStatus = 'Under target'
    } else {
      prepTargetStatus = 'Over target'
    }
  }

  const isManagerView = dashboardView === 'Manager'
  const visibleSectionIds: SectionId[] = isManagerView
    ? sectionIds
    : sectionIds.filter((sectionId) => sectionId !== 'recipes')

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

  const handleExportData = () => {
    try {
      const payload: BackupPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        prepItems,
        inventoryItems,
        eightySixItems,
        shiftNotes,
        auditEntries,
        recipes,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const dateStamp = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `lineflow-backup-${dateStamp}.json`
      link.click()
      URL.revokeObjectURL(url)
      setBackupError('')
      announceAction('Data exported to backup file.')
    } catch {
      setBackupError('Could not export your data. Please try again.')
    }
  }

  const handleExportReport = () => {
    try {
      const csvLines = [
        'Metric,Value',
        `View,${dashboardView}`,
        `Range,${dashboardRange}`,
        `Sales,${selectedMetrics.sales}`,
        `Sales Delta,${selectedMetrics.salesDelta}`,
        `Labor Cost,${selectedMetrics.laborCost}`,
        `Labor Hours,${selectedMetrics.laborHours}`,
        `Forecast,${selectedMetrics.forecast}`,
        `Open Prep,${openPrepCount}`,
        `Ready Prep,${readyPrepCount}`,
        `Task Completion,${completionRate}%`,
        `Low Stock Warnings,${visibleLowStockCount}`,
      ]

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `lineflow-report-${dashboardRange.toLowerCase()}.csv`
      link.click()
      URL.revokeObjectURL(url)
      announceAction(`${dashboardRange} report exported.`)
      setBackupError('')
    } catch {
      setBackupError('Could not export the report. Please try again.')
    }
  }

  const handleRequestImport = () => {
    importFileRef.current?.click()
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown

      if (!isBackupPayload(parsed)) {
        throw new Error('invalid backup')
      }

      const backup = parsed as Record<string, unknown>
      setPrepItems(normalizeImportedPrepItems(backup.prepItems))
      setInventoryItems(loadStoredInventoryItems(backup.inventoryItems))
      setEightySixItems(loadStoredEightySixItems(backup.eightySixItems))
      setShiftNotes(loadStoredShiftNotes(backup.shiftNotes))
      setAuditEntries(loadStoredAuditEntries(backup.auditEntries))
      if (backup.recipes !== undefined) {
        setRecipes(loadStoredRecipes(backup.recipes))
      }
      setBackupError('')
      announceAction('Backup imported successfully.')
    } catch {
      setBackupError('Backup file could not be imported. Use a LineFlow backup JSON file.')
    }
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
  }, [prepItems, storageKeys.prepItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.inventoryItems, JSON.stringify(inventoryItems))
    }
  }, [inventoryItems, storageKeys.inventoryItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.eightySixItems, JSON.stringify(eightySixItems))
    }
  }, [eightySixItems, storageKeys.eightySixItems])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.shiftNotes, JSON.stringify(shiftNotes))
    }
  }, [shiftNotes, storageKeys.shiftNotes])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.upcomingParties, JSON.stringify(upcomingParties))
    }
  }, [upcomingParties, storageKeys.upcomingParties])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.auditEntries, JSON.stringify(auditEntries))
    }
  }, [auditEntries, storageKeys.auditEntries])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.serviceTime, serviceTime)
    }
  }, [serviceTime, storageKeys.serviceTime])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${storageKeys.serviceTime}-reservations`, String(totalReservations))
    }
  }, [totalReservations, storageKeys.serviceTime])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.recipes, JSON.stringify(recipes))
    }
  }, [recipes, storageKeys.recipes])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKeys.teamSchedule, JSON.stringify(teamShiftEntries))
    }
  }, [teamShiftEntries, storageKeys.teamSchedule])

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

  // Auto-refresh clock every 10 seconds for accurate countdown
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(interval)
  }, [])

  // Online / offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Keyboard shortcuts: N = new prep, E = new 86, I = new inventory
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'n' || event.key === 'N') {
        setIsPrepFormOpen(true)
        jumpToSection('prep-board')
      } else if (event.key === 'e' || event.key === 'E') {
        setIsEightySixFormOpen(true)
        jumpToSection('eighty-six')
      } else if (event.key === 'i' || event.key === 'I') {
        setIsInventoryFormOpen(true)
        jumpToSection('inventory')
      } else if (event.key === 'r' || event.key === 'R') {
        setIsRecipeFormOpen(true)
        jumpToSection('recipes')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!isManagerView && activeSection === 'recipes') {
      setActiveSection('snapshot')
      window.location.hash = 'snapshot'
    }
  }, [activeSection, isManagerView])

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
      `${shiftLabel} handoff — ${dateLabel}: ${openPrepCount} prep items open (${pendingPrep || 'none'}). ` +
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
      status: 'Queued',
      dueTime: newPrepDueTime.trim() || 'TBD',
      quantity: newPrepQuantity.trim(),
      assignee: newPrepAssignee,
    }

    setPrepItems((currentItems) => [newItem, ...currentItems])

    addShiftNote(newPrepStation, `Prep added: ${name} (${newPrepPriority} priority), due ${newItem.dueTime}.`)

    setNewPrepName('')
    setNewPrepPriority('Medium')
    setNewPrepDueTime('11:30 AM')
    setNewPrepQuantity('')
    setNewPrepAssignee('')
    setHandoffMessage('')
    setIsPrepFormOpen(false)
    addAuditEntry('Prep', `${name} added for ${newPrepStation} with ${newPrepPriority.toLowerCase()} priority.`)
    announceAction(`${name} added to prep for ${newPrepStation}.`)
  }

  const handleBatchMarkReady = () => {
    if (selectedPrepIds.size === 0) return
    const ids = Array.from(selectedPrepIds)
    ids.forEach((id) => updatePrepItemStatus(id, 'Ready'))
    setSelectedPrepIds(new Set())
    announceAction(`${ids.length} prep item${ids.length > 1 ? 's' : ''} marked ready.`)
  }

  const togglePrepSelection = (id: string) => {
    setSelectedPrepIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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
    } else if (status === 'In Progress' && (targetItem.status === 'Not Started' || targetItem.status === 'Queued')) {
      announceAction(`${targetItem.name} fired on ${targetItem.station}.`)
    } else if (status === 'Blocked' && targetItem.status !== 'Blocked') {
      addAuditEntry('Prep', `${targetItem.name} blocked on ${targetItem.station}.`)
      announceAction(`${targetItem.name} marked blocked.`)
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

  const handleAddUpcomingParty = () => {
    const name = newPartyName.trim()
    const date = newPartyDate.trim()
    if (!name || !date) {
      return
    }

    const nextParty: UpcomingParty = {
      id: createRuntimeId('party'),
      name,
      date,
      notes: newPartyNotes.trim(),
    }

    setUpcomingParties((current) => [nextParty, ...current])
    setNewPartyName('')
    setNewPartyDate('')
    setNewPartyNotes('')
    announceAction(`${name} added to upcoming parties.`)
  }

  const handleRemoveUpcomingParty = (partyId: string) => {
    const target = upcomingParties.find((party) => party.id === partyId)
    if (!target || !window.confirm(`Remove ${target.name} from upcoming parties?`)) {
      return
    }

    setUpcomingParties((current) => current.filter((party) => party.id !== partyId))
    announceAction(`${target.name} removed from upcoming parties.`)
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

  const handleSaveServiceTime = () => {
    const trimmed = serviceTimeDraft.trim()
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      setServiceTime(trimmed)
    }
    setIsEditingServiceTime(false)
  }

  const handleAddRecipe = () => {
    const name = newRecipeName.trim()
    if (!name) return
    setRecipes((current) => [
      {
        id: createRuntimeId('recipe'),
        name,
        station: newRecipeStation,
        category: newRecipeCategory,
        recipeYield: newRecipeYield.trim(),
        prepTime: newRecipePrepTime.trim(),
        ingredients: newRecipeIngredients.trim(),
        instructions: newRecipeInstructions.trim(),
        notes: newRecipeNotes.trim(),
      },
      ...current,
    ])
    setNewRecipeName('')
    setNewRecipeStation('Pantry')
    setNewRecipeCategory('Other')
    setNewRecipeYield('')
    setNewRecipePrepTime('')
    setNewRecipeIngredients('')
    setNewRecipeInstructions('')
    setNewRecipeNotes('')
    setIsRecipeFormOpen(false)
    announceAction(`${name} added to recipe book.`)
  }

  const handleDeleteRecipe = (recipeId: string) => {
    const target = recipes.find((r) => r.id === recipeId)
    const targetIndex = recipes.findIndex((r) => r.id === recipeId)
    if (!target || !window.confirm(`Remove "${target.name}" from the recipe book?`)) return
    setRecipes((current) => current.filter((r) => r.id !== recipeId))
    if (selectedRecipeId === recipeId) setSelectedRecipeId(null)
    announceAction(`${target.name} removed from recipe book.`)
    queueUndoAction(`${target.name} removed from recipe book.`, () => {
      setRecipes((current) => {
        if (current.some((r) => r.id === target.id)) return current
        const next = [...current]
        next.splice(Math.min(targetIndex, next.length), 0, target)
        return next
      })
    })
  }

  return (
    <div className={`app-shell${isDarkMode ? '' : ' app-shell--light'}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {actionAnnouncement}
      </div>
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar${isSidebarOpen ? ' sidebar--open' : ''}`}>
        <div>
          <div className="sidebar-header">
            <p className="brand-kicker">BOH operations</p>
            <button
              className="sidebar-close"
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <h1 className="brand-title">LineFlow</h1>
          <div className="kitchen-badge">
            <span className="kitchen-badge-name">{activeKitchen?.name ?? 'My Kitchen'}</span>
            <button
              className="kitchen-switch-button"
              type="button"
              onClick={() => { setIsSidebarOpen(false); onManageKitchens() }}
            >
              Switch
            </button>
          </div>
          <div className="profile-badge">
            <span className="profile-badge-name">{activeProfileName}</span>
            <button
              className="profile-switch-button"
              type="button"
              onClick={() => {
                setIsSidebarOpen(false)
                onSwitchProfile()
              }}
            >
              Switch profile
            </button>
          </div>
          <p className="brand-copy">
            {dashboardView === 'Manager'
              ? 'Manager workspace for sales, labor, stock visibility, and shift handoff.'
              : 'Staff workspace for live prep priorities, station coverage, and stock warnings.'}
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard sections">
          {visibleSectionIds.map((sectionId) => (
            <a
              key={sectionId}
              className={activeSection === sectionId ? 'is-active' : undefined}
              href={`#${sectionId}`}
              aria-current={activeSection === sectionId ? 'location' : undefined}
              onClick={() => setIsSidebarOpen(false)}
            >
              {sectionLabels[sectionId]}
            </a>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-label">Current shift</span>
          <strong>{shiftLabel}</strong>
          <p className="sidebar-note">Data is stored locally in this browser.</p>
          <div className="kitchen-share-block">
            <span className="sidebar-label">Kitchen group</span>
            <strong>{activeKitchen?.joinCode ?? '—'}</strong>
            <button
              className="secondary-button"
              type="button"
              onClick={async () => {
                const inviteLink = `lineflow://kitchen/join?code=${activeKitchen?.joinCode ?? ''}`
                try {
                  await navigator.clipboard.writeText(inviteLink)
                  announceAction('Kitchen invite link copied.')
                } catch {
                  window.prompt('Copy this kitchen invite link:', inviteLink)
                }
              }}
            >
              Copy join link
            </button>
          </div>
          <div className="sidebar-actions">
            <button className="secondary-button" type="button" onClick={handleExportData}>
              Export Backup
            </button>
            <button className="secondary-button" type="button" onClick={handleRequestImport}>
              Import Backup
            </button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            onChange={handleImportFileChange}
            className="sr-only"
            tabIndex={-1}
            aria-label="Import LineFlow backup"
          />
          {backupError && (
            <p className="form-error" role="alert">
              {backupError}
            </p>
          )}
        </div>

        <div className="sidebar-legal">
          <p className="sidebar-note">
            Your data stays in this browser — nothing is sent to a server.
          </p>
          <div className="sidebar-legal-links">
            <a href="https://github.com/Ericr567/Boh-dashboard/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">
              Privacy
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://github.com/Ericr567/Boh-dashboard/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">
              Terms
            </a>
          </div>
        </div>
      </aside>

      <main id="main-content" className={`dashboard dashboard--${dashboardView.toLowerCase()}`}>
        {!isOnline && (
          <div className="offline-banner" role="status">
            You are offline. The app is still fully functional — data is saved locally.
          </div>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">{dashboardView} Dashboard</p>
            <h2>
              {dashboardView === 'Manager'
                ? 'Run service, labor, sales, and inventory from one place.'
                : 'Give the team a focused view of tasks, stations, and shift alerts.'}
            </h2>
          </div>

          <div className="topbar-meta">
            <button
              className="hamburger-button"
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open menu"
              aria-expanded={isSidebarOpen}
            >
              ☰
            </button>

            <div className="toggle-group" role="tablist" aria-label="Dashboard view">
              {(['Manager', 'Staff'] as DashboardView[]).map((view) => (
                <button
                  key={view}
                  className={`toggle-chip${dashboardView === view ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setDashboardView(view)}
                  aria-pressed={dashboardView === view}
                >
                  {view}
                </button>
              ))}
            </div>

            {isManagerView && (
              <div className="toggle-group" role="group" aria-label="Report range">
                {(['Day', 'Week', 'Month'] as DashboardRange[]).map((range) => (
                  <button
                    key={range}
                    className={`toggle-chip${dashboardRange === range ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setDashboardRange(range)}
                    aria-pressed={dashboardRange === range}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}

            <div className="shift-pill">
              <span>{shiftLabel}</span>
              <strong>{dateLabel}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={() => setIsDarkMode((current) => !current)}>
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            {dashboardView === 'Manager' ? (
              <>
                <button className="action-button" type="button" onClick={handleExportReport}>
                  Export Report
                </button>
                <button className="secondary-button" type="button" onClick={handleGenerateHandoff}>
                  Generate Handoff
                </button>
              </>
            ) : (
              <>
                <button className="action-button" type="button" onClick={() => jumpToSection('prep-board')}>
                  Open Task Board
                </button>
                <button className="secondary-button" type="button" onClick={() => jumpToSection('inventory')}>
                  View Stock Alerts
                </button>
              </>
            )}
          </div>
        </header>

        <section className={`dashboard-role-banner dashboard-role-banner--${dashboardView.toLowerCase()}`} aria-label={`${dashboardView} dashboard summary`}>
          <div>
            <p className="eyebrow">Role summary</p>
            <h3>{dashboardHeroTitle}</h3>
            <p>{dashboardHeroSummary}</p>
          </div>
          <div className="dashboard-role-stats">
            <div className="role-stat">
              <span>On shift</span>
              <strong>{staffOnShiftCount}</strong>
            </div>
            <div className="role-stat">
              <span>Urgent prep</span>
              <strong>{urgentPrepCount}</strong>
            </div>
            <div className="role-stat">
              <span>Blocked</span>
              <strong>{blockedPrepCount}</strong>
            </div>
            <div className="role-stat">
              <span>Overdue</span>
              <strong>{overduePrepCount}</strong>
            </div>
            <div className="role-stat">
              <span>Low stock</span>
              <strong>{visibleLowStockCount}</strong>
            </div>
          </div>
        </section>

        {handoffMessage && (
          <p className="handoff-message" role="status" aria-live="polite">
            {handoffMessage}
          </p>
        )}

        {serviceAlerts.length > 0 && (
          <div className="service-alert-banner" role="status" aria-live="polite">
            <span className="eyebrow">Service alerts</span>
            <strong>{serviceAlerts[0]}</strong>
            {serviceAlerts.length > 1 && <span>{serviceAlerts.slice(1).join(' • ')}</span>}
          </div>
        )}

        <div className="reservation-target-card" aria-label="Reservation-based prep target">
          <div>
            <p className="eyebrow">Prep target</p>
            <h3>Reservations to prep equation</h3>
          </div>
          <div className="reservation-target-controls">
            <label>
              <span>Total reservations</span>
              <input
                type="number"
                min={0}
                value={totalReservations}
                onChange={(event) => setTotalReservations(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <div className="reservation-target-summary">
              <strong>{prepLowerBound}–{prepUpperBound}</strong>
              <span>target range, using $prep = reservations × 15\%$</span>
            </div>
          </div>
          <p className="reservation-target-status">
            Current open prep: {currentPrepLoad} · {prepTargetStatus}
          </p>
        </div>

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

        <div
          className={`service-countdown${
            countdown === null
              ? ' countdown--past'
              : countdown.totalMinutes < 30
                ? ' countdown--urgent'
                : countdown.totalMinutes < 60
                  ? ' countdown--warning'
                  : ''
          }`}
        >
          <div className="countdown-left">
            <p className="eyebrow">Service countdown</p>
            {isEditingServiceTime ? (
              <form
                className="countdown-edit-form"
                onSubmit={(event) => { event.preventDefault(); handleSaveServiceTime() }}
              >
                <input
                  className="countdown-time-input"
                  type="time"
                  value={serviceTimeDraft}
                  onChange={(event) => setServiceTimeDraft(event.target.value)}
                  autoFocus
                />
                <button className="secondary-button" type="submit">Set</button>
                <button className="secondary-button" type="button" onClick={() => setIsEditingServiceTime(false)}>Cancel</button>
              </form>
            ) : (
              <button
                className="countdown-time-button"
                type="button"
                onClick={() => { setServiceTimeDraft(serviceTime); setIsEditingServiceTime(true) }}
                aria-label={`Service time: ${serviceTime}. Click to edit.`}
              >
                {serviceTime}
                <span className="countdown-edit-hint">edit</span>
              </button>
            )}
          </div>
          <div className="countdown-display">
            {countdown === null ? (
              <span className="countdown-value countdown-past-text">Service underway</span>
            ) : (
              <>
                <span className="countdown-value">
                  {countdown.hrs > 0 ? `${countdown.hrs}h ${countdown.mins}m` : `${countdown.mins}m`}
                </span>
                <span className="countdown-sublabel">remaining</span>
              </>
            )}
          </div>
        </div>

          <section id="snapshot" className="snapshot-grid" aria-label="Service snapshot">
            {snapshotCards.map((card) => (
              <section key={card.label} className={`metric-card${card.className ? ` ${card.className}` : ''}`}>
                <span className="metric-label">{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.detail}</p>
              </section>
            ))}
          </section>

          {dashboardView === 'Manager' ? (
            <section className="manager-grid" aria-label="Manager dashboard overview">
              <article className="panel analytics-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Weekly trends</p>
                    <h3>Sales pace for the selected range</h3>
                  </div>
                  <span className="panel-badge">{selectedMetrics.salesDelta}</span>
                </div>
                <div className="trend-chart" role="img" aria-label={`${dashboardRange} sales trend chart`}>
                  {selectedMetrics.trendLabels.map((label, index) => (
                    <div className="trend-column" key={label}>
                      <div className="trend-bar-track">
                        <div
                          className="trend-bar-fill"
                          style={{ height: `${selectedMetrics.trendValues[index]}%` }}
                        />
                      </div>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel labor-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Labor tracking</p>
                    <h3>Cost and hours</h3>
                  </div>
                  <span className="panel-badge">Target 25%</span>
                </div>
                <div className="labor-breakdown">
                  <div className="mini-metric">
                    <span>Labor cost</span>
                    <strong>{selectedMetrics.laborCost}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Scheduled hours</span>
                    <strong>{selectedMetrics.laborHours}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Overtime risk</span>
                    <strong>{selectedMetrics.overtimeRisk}</strong>
                  </div>
                </div>
              </article>

              <article className="panel staffing-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Shift schedule</p>
                    <h3>Today’s coverage</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="panel-badge">{signedInTeamMembers.length} on shift</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={clearAllStaffOffShift}
                      disabled={signedInTeamMembers.length === 0}
                    >
                      All off shift
                    </button>
                  </div>
                </div>
                <div className="roster-list">
                  {signedInTeamMembers.length === 0 ? (
                    <p className="empty-state">No one on shift yet.</p>
                  ) : (
                    teamRosterMembers
                      .filter((member) => member.clockedIn)
                      .map((member) => (
                        <div className="schedule-row" key={member.profileId}>
                          <div>
                            <strong>{member.name}</strong>
                            <p>{member.role}</p>
                          </div>
                          <div className="schedule-meta">
                            <span>{member.shift}</span>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleShiftSignedIn(member.profileId)}
                            >
                              Clock out
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
                <div className="panel-toolbar" style={{ marginTop: '1rem' }}>
                  <select
                    className="toolbar-select"
                    value={teamMemberToAddId}
                    onChange={(event) => setTeamMemberToAddId(event.target.value)}
                    aria-label="Add team member"
                  >
                    <option value="">Add a team member</option>
                    {addableTeamMembers.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name} ({profile.role})</option>
                    ))}
                  </select>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleAddTeamMemberToKitchen}
                    disabled={!teamMemberToAddId}
                  >
                    Add to kitchen
                  </button>
                </div>
              </article>

              <article className="panel attendance-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Attendance</p>
                    <h3>Who is checked in</h3>
                  </div>
                  <span className="panel-badge">Live board</span>
                </div>
                <div className="attendance-list">
                  {teamRosterMembers.length === 0 ? (
                    <p className="empty-state">No one on shift yet.</p>
                  ) : (
                    teamRosterMembers.map((member) => (
                      <div className="attendance-row" key={`${member.profileId}-attendance`}>
                        <span>{member.name}</span>
                        <span className={`status-chip status-${member.clockedIn ? 'clocked-in' : 'off-today'}`}>
                          {member.clockedIn ? 'Clocked In' : 'Off Today'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="panel tasks-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Task completion</p>
                    <h3>Prep and checklist status</h3>
                  </div>
                  <span className="panel-badge">{completionRate}% done</span>
                </div>
                <div className="task-status-list">
                  {managerTaskStatusItems.map((task) => (
                    <div className="task-status-item" key={task.label}>
                      <div className="task-status-meta">
                        <div>
                          <strong>{task.label}</strong>
                          <p>{task.detail}</p>
                        </div>
                        <span className={`status-chip status-${task.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="task-progress">
                        <div className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel alerts-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Low-stock warnings</p>
                    <h3>Items needing attention</h3>
                  </div>
                  <span className="panel-badge">Reorder now</span>
                </div>
                <div className="alert-list">
                  {lowStockWarnings.map((warning) => (
                    <div className="alert-row" key={warning.name}>
                      <div>
                        <strong>{warning.name}</strong>
                        <p>{warning.detail}</p>
                      </div>
                      <span className={`status-chip status-${warning.status.toLowerCase()}`}>
                        {warning.status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          ) : (
            <section className="staff-focus-grid" aria-label="Staff dashboard overview">
              <article className="panel tasks-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Staff focus</p>
                    <h3>Top priorities for this shift</h3>
                  </div>
                  <span className="panel-badge">{completionRate}% done</span>
                </div>
                <div className="task-status-list">
                  {staffFocusTaskStatusItems.length === 0 ? (
                    <div className="empty-state">
                      <p className="prep-empty">No prep items in hand yet. Add or fire a prep item to update the staff focus bars.</p>
                    </div>
                  ) : (
                    staffFocusTaskStatusItems.map((task) => (
                      <div className="task-status-item" key={`${task.label}-staff`}>
                        <div className="task-status-meta">
                          <div>
                            <strong>{task.label}</strong>
                            <p>{task.detail}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={`priority-chip priority-${task.priority.toLowerCase()}`}>
                              {task.priority}
                            </span>
                            <span className={`status-chip status-${task.status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {task.status}
                            </span>
                          </div>
                        </div>
                        <div className="task-progress">
                          <div className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="panel staffing-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Shift schedule</p>
                    <h3>Who’s on the line</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="panel-badge">Crew view</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={clearAllStaffOffShift}
                      disabled={signedInTeamMembers.length === 0}
                    >
                      All off shift
                    </button>
                  </div>
                </div>
                <div className="roster-list">
                  {teamRosterMembers.length === 0 ? (
                    <p className="empty-state">No one on shift yet.</p>
                  ) : (
                    teamRosterMembers.map((member) => (
                      <div className="schedule-row" key={`${member.profileId}-staff`}>
                        <div>
                          <strong>{member.name}</strong>
                          <p>{member.role}</p>
                        </div>
                        <div className="schedule-meta">
                          <span>{member.shift}</span>
                          <div className="panel-toolbar" style={{ gap: '0.4rem', width: '100%' }}>
                            <input
                              className="toolbar-input"
                              type="time"
                              value={member.inTime}
                              onChange={(event) => updateTeamShiftEntry(member.profileId, 'inTime', event.target.value)}
                              aria-label={`${member.name} in time`}
                            />
                            <input
                              className="toolbar-input"
                              type="time"
                              value={member.outTime}
                              onChange={(event) => updateTeamShiftEntry(member.profileId, 'outTime', event.target.value)}
                              aria-label={`${member.name} out time`}
                            />
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleShiftSignedIn(member.profileId)}
                            >
                              {member.clockedIn ? 'Clock out' : 'Clock in'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="panel-toolbar" style={{ marginTop: '1rem' }}>
                  <select
                    className="toolbar-select"
                    value={teamMemberToAddId}
                    onChange={(event) => setTeamMemberToAddId(event.target.value)}
                    aria-label="Add team member"
                  >
                    <option value="">Add a team member</option>
                    {addableTeamMembers.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name} ({profile.role})</option>
                    ))}
                  </select>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleAddTeamMemberToKitchen}
                    disabled={!teamMemberToAddId}
                  >
                    Add to kitchen
                  </button>
                </div>
              </article>

              <article className="panel alerts-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Low-stock warnings</p>
                    <h3>Products to conserve</h3>
                  </div>
                  <span className="panel-badge">Stay alert</span>
                </div>
                <div className="alert-list">
                  {lowStockWarnings.map((warning) => (
                    <div className="alert-row" key={`${warning.name}-staff`}>
                      <div>
                        <strong>{warning.name}</strong>
                        <p>{warning.detail}</p>
                      </div>
                      <span className={`status-chip status-${warning.status.toLowerCase()}`}>
                        {warning.status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          <section className={`dashboard-grid${isManagerView ? '' : ' dashboard-grid--staff'}`}>
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
                {selectedPrepIds.size > 0 && (
                  <button
                    className="action-button prep-action-button"
                    type="button"
                    onClick={handleBatchMarkReady}
                  >
                    Mark {selectedPrepIds.size} Ready
                  </button>
                )}
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
                <select
                  className="toolbar-select"
                  value={prepStatusFilter}
                  onChange={(event) => setPrepStatusFilter(event.target.value as PrepStatusFilter)}
                  aria-label="Filter prep by status"
                >
                  <option value="All">All states</option>
                  {prepStatusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
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

                  <label>
                    Quantity / Amount
                    <input
                      value={newPrepQuantity}
                      onChange={(event) => setNewPrepQuantity(event.target.value)}
                      placeholder="e.g. 6 portions"
                    />
                  </label>

                  <label>
                    Assignee (optional)
                    <select
                      value={newPrepAssignee}
                      onChange={(event) => setNewPrepAssignee(event.target.value as StationName | '')}
                    >
                      <option value="">Unassigned</option>
                      {stationNames.map((stationName) => (
                        <option key={stationName} value={stationName}>
                          {stationName}
                        </option>
                      ))}
                    </select>
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
                filteredPrepItems.map((item) => {
                  const isUrgent = isPreServiceUrgent && item.status !== 'Ready'
                  return (
                    <article
                      className={`prep-card${isUrgent ? ' prep-card--urgent' : ''}`}
                      key={item.id}
                    >
                      <div className="prep-header-row">
                        <label className="prep-select-label" aria-label={`Select ${item.name}`}>
                          <input
                            type="checkbox"
                            className="prep-select-checkbox"
                            checked={selectedPrepIds.has(item.id)}
                            onChange={() => togglePrepSelection(item.id)}
                          />
                        </label>
                        <div>
                          <h4>
                            {item.name}
                            {isUrgent && <span className="urgency-badge">Urgent</span>}
                          </h4>
                          <p>{item.station} station{item.assignee ? ` — ${item.assignee}` : ''}</p>
                        </div>
                        <div className="prep-status-controls">
                          <span className={`status-chip status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {item.status}
                          </span>
                          <select
                            className="prep-status-select"
                            value={item.status}
                            onChange={(event) => updatePrepItemStatus(item.id, event.target.value as PrepStatus)}
                            aria-label={`Change status for ${item.name}`}
                          >
                            {prepStatusOptions.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="prep-meta">
                        <span className={`priority-chip priority-${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                        <span>Due {item.dueTime}</span>
                        {item.quantity && <span>{item.quantity}</span>}
                      </div>
                      {item.status === 'Not Started' || item.status === 'Queued' ? (
                        <div className="prep-card-fire">
                          <button
                            className="fire-button"
                            type="button"
                            onClick={() => updatePrepItemStatus(item.id, 'In Progress')}
                          >
                            Fire it →
                          </button>
                        </div>
                      ) : null}
                      {item.status === 'In Progress' ? (
                        <div className="prep-card-fire">
                          <button
                            className="done-button"
                            type="button"
                            onClick={() => updatePrepItemStatus(item.id, 'Ready')}
                          >
                            Mark Ready ✓
                          </button>
                        </div>
                      ) : null}
                    </article>
                  )
                })
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

              {recommendedReorders.length > 0 && (
                <div className="reorder-list" aria-label="Recommended reorder actions">
                  <p className="eyebrow">Reorder suggestions</p>
                  {recommendedReorders.map((item) => (
                    <div className="reorder-row" key={item.name}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.quantity} {item.unit} left · threshold {item.threshold}</p>
                      </div>
                      <span className={`status-chip status-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

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
                  {(() => {
                    const total = station.activeTasks + station.readyItems
                    const pct = total > 0 ? Math.round((station.readyItems / total) * 100) : 0
                    return total > 0 ? (
                      <div className="station-progress-track" aria-label={`${pct}% complete`}>
                        <div className="station-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null
                  })()}
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

            <section id="upcoming-parties" className="panel notes-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Upcoming parties</p>
                <h3>Manual party planning</h3>
              </div>
            </div>

            <div className="notes-list">
              <form
                className="prep-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleAddUpcomingParty()
                }}
              >
                <label>
                  Party name
                  <input
                    value={newPartyName}
                    onChange={(event) => setNewPartyName(event.target.value)}
                    placeholder="e.g. Birthday dinner"
                    required
                  />
                </label>

                <label>
                  Date
                  <input
                    type="date"
                    value={newPartyDate}
                    onChange={(event) => setNewPartyDate(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Notes
                  <textarea
                    className="recipe-textarea"
                    value={newPartyNotes}
                    onChange={(event) => setNewPartyNotes(event.target.value)}
                    rows={3}
                    placeholder="Guest count, timing, special requests..."
                  />
                </label>

                <button className="action-button prep-submit" type="submit">
                  Add party
                </button>
              </form>

              {upcomingParties.length === 0 ? (
                <div className="empty-state">
                  <p className="prep-empty">No upcoming parties entered yet.</p>
                </div>
              ) : (
                upcomingParties.map((party) => (
                  <article className="note-card" key={party.id}>
                    <div className="note-meta">
                      <span>{party.date}</span>
                    </div>
                    <p><strong>{party.name}</strong>{party.notes ? ` • ${party.notes}` : ''}</p>
                    <div className="eighty-six-item-actions">
                      <button
                        className="secondary-button danger-button"
                        type="button"
                        onClick={() => handleRemoveUpcomingParty(party.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

            <section id="notes" className="panel notes-panel" tabIndex={0}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{isManagerView ? 'Shift notes' : 'Team notes'}</p>
                <h3>{isManagerView ? 'Recent handoff context' : 'Crew updates and handoff notes'}</h3>
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

              {isManagerView && (
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
              )}
            </div>
          </section>

            {isManagerView && (
            <section id="recipes" className="panel recipes-panel" tabIndex={0}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Recipe book</p>
                  <h3>Kitchen reference</h3>
                </div>
                <span className="panel-badge">{recipes.length} recipes</span>
              </div>

              <div className="recipe-list">
                <div className="recipe-actions">
                  <button
                    className="action-button prep-action-button"
                    type="button"
                    onClick={() => setIsRecipeFormOpen((open) => !open)}
                  >
                    {isRecipeFormOpen ? 'Cancel Recipe' : 'Add Recipe'}
                  </button>
                </div>

                <div className="panel-toolbar" role="group" aria-label="Filter recipes">
                  <input
                    className="toolbar-input"
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                    placeholder="Search recipes or ingredients"
                    aria-label="Search recipes"
                  />
                  <select
                    className="toolbar-select"
                    value={recipeCategoryFilter}
                    onChange={(e) => setRecipeCategoryFilter(e.target.value as RecipeCategoryFilter)}
                    aria-label="Filter by category"
                  >
                    <option value="All">All categories</option>
                    {recipeCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <select
                    className="toolbar-select"
                    value={recipeStationFilter}
                    onChange={(e) => setRecipeStationFilter(e.target.value as PrepStationFilter)}
                    aria-label="Filter by station"
                  >
                    <option value="All">All stations</option>
                    {stationNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {isRecipeFormOpen && (
                  <form
                    className="prep-form recipe-form"
                    onSubmit={(e) => { e.preventDefault(); handleAddRecipe() }}
                  >
                    <label>
                      Recipe name
                      <input
                        value={newRecipeName}
                        onChange={(e) => setNewRecipeName(e.target.value)}
                        placeholder="e.g. Herb butter"
                        required
                      />
                    </label>
                    <label>
                      Station
                      <select
                        value={newRecipeStation}
                        onChange={(e) => setNewRecipeStation(e.target.value as StationName)}
                      >
                        {stationNames.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label>
                      Category
                      <select
                        value={newRecipeCategory}
                        onChange={(e) => setNewRecipeCategory(e.target.value as RecipeCategory)}
                      >
                        {recipeCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </label>
                    <label>
                      Yield
                      <input
                        value={newRecipeYield}
                        onChange={(e) => setNewRecipeYield(e.target.value)}
                        placeholder="e.g. 12 portions"
                      />
                    </label>
                    <label>
                      Prep time
                      <input
                        value={newRecipePrepTime}
                        onChange={(e) => setNewRecipePrepTime(e.target.value)}
                        placeholder="e.g. 20 min"
                      />
                    </label>
                    <label className="recipe-form-full">
                      Ingredients (one per line)
                      <textarea
                        className="recipe-textarea"
                        value={newRecipeIngredients}
                        onChange={(e) => setNewRecipeIngredients(e.target.value)}
                        placeholder={"2 cups heavy cream\n4 cloves garlic\n..."}
                        rows={5}
                      />
                    </label>
                    <label className="recipe-form-full">
                      Instructions
                      <textarea
                        className="recipe-textarea"
                        value={newRecipeInstructions}
                        onChange={(e) => setNewRecipeInstructions(e.target.value)}
                        placeholder="Step-by-step method..."
                        rows={5}
                      />
                    </label>
                    <label className="recipe-form-full">
                      Notes
                      <textarea
                        className="recipe-textarea"
                        value={newRecipeNotes}
                        onChange={(e) => setNewRecipeNotes(e.target.value)}
                        placeholder="Allergy info, substitutions, plating notes..."
                        rows={3}
                      />
                    </label>
                    <button className="action-button prep-submit" type="submit">
                      Save Recipe
                    </button>
                  </form>
                )}

                {recipes.length === 0 ? (
                  <div className="empty-state">
                    <p className="prep-empty">No recipes yet. Add one to build your kitchen reference book.</p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setIsRecipeFormOpen(true)}
                    >
                      Add first recipe
                    </button>
                  </div>
                ) : filteredRecipes.length === 0 ? (
                  <p className="prep-empty">No recipes match your search or filters.</p>
                ) : (
                  <div className="recipe-grid">
                    {filteredRecipes.map((recipe) => {
                      const isOpen = selectedRecipeId === recipe.id
                      return (
                        <article className={`recipe-card${isOpen ? ' recipe-card--open' : ''}`} key={recipe.id}>
                          <button
                            className="recipe-card-toggle"
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setSelectedRecipeId(isOpen ? null : recipe.id)}
                          >
                            <div className="recipe-card-main">
                              <h4>{recipe.name}</h4>
                              <p>
                                {recipe.station}
                                {recipe.prepTime ? ` · ${recipe.prepTime}` : ''}
                                {recipe.recipeYield ? ` · ${recipe.recipeYield}` : ''}
                              </p>
                            </div>
                            <div className="recipe-card-meta">
                              <span className="recipe-category-chip">{recipe.category}</span>
                              <span className="recipe-chevron" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="recipe-detail">
                              {recipe.ingredients && (
                                <div className="recipe-section">
                                  <p className="eyebrow">Ingredients</p>
                                  <ul className="recipe-ingredients">
                                    {recipe.ingredients.split('\n').filter(Boolean).map((line, i) => (
                                      <li key={i}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {recipe.instructions && (
                                <div className="recipe-section">
                                  <p className="eyebrow">Instructions</p>
                                  <p className="recipe-body">{recipe.instructions}</p>
                                </div>
                              )}
                              {recipe.notes && (
                                <div className="recipe-section">
                                  <p className="eyebrow">Notes</p>
                                  <p className="recipe-body">{recipe.notes}</p>
                                </div>
                              )}
                              <div className="recipe-detail-actions">
                                <button
                                  className="secondary-button danger-button"
                                  type="button"
                                  onClick={() => handleDeleteRecipe(recipe.id)}
                                >
                                  Remove Recipe
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
            )}
          </section>
      </main>

      <nav className="bottom-tab-bar" aria-label="Quick navigation">
        {visibleSectionIds.map((sectionId) => (
          <a
            key={sectionId}
            href={`#${sectionId}`}
            className={`bottom-tab${activeSection === sectionId ? ' is-active' : ''}`}
            onClick={() => { setActiveSection(sectionId); setIsFabOpen(false) }}
            aria-current={activeSection === sectionId ? 'location' : undefined}
          >
            {sectionShortLabels[sectionId]}
          </a>
        ))}
      </nav>

      <div className="fab-container">
        {isFabOpen && (
          <>
            <div
              className="fab-backdrop"
              onClick={() => setIsFabOpen(false)}
              aria-hidden="true"
            />
            <div className="fab-sheet" role="menu">
              <button
                type="button"
                className="fab-option"
                onClick={() => {
                  setIsPrepFormOpen(true)
                  jumpToSection('prep-board')
                  setIsFabOpen(false)
                }}
              >
                New Prep Item
              </button>
              <button
                type="button"
                className="fab-option"
                onClick={() => {
                  setIsInventoryFormOpen(true)
                  jumpToSection('inventory')
                  setIsFabOpen(false)
                }}
              >
                Add Inventory Item
              </button>
              <button
                type="button"
                className="fab-option"
                onClick={() => {
                  setIsEightySixFormOpen(true)
                  jumpToSection('eighty-six')
                  setIsFabOpen(false)
                }}
              >
                86 an Item
              </button>
            </div>
          </>
        )}
        <button
          className={`fab${isFabOpen ? ' fab--open' : ''}`}
          type="button"
          onClick={() => setIsFabOpen((open) => !open)}
          aria-label={isFabOpen ? 'Close quick add' : 'Quick add'}
          aria-expanded={isFabOpen}
        >
          {isFabOpen ? '✕' : '+'}
        </button>
      </div>
    </div>
  )
}

// ─── Kitchen management helpers ───────────────────

const loadKitchens = (): KitchenProfile[] => {
  try {
    const raw = window.localStorage.getItem(kitchenMetaKeys.kitchens)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is KitchenProfile =>
      k && typeof k.id === 'string' && typeof k.name === 'string' && typeof k.joinCode === 'string',
    )
  } catch {
    return []
  }
}

const saveKitchens = (kitchens: KitchenProfile[]) => {
  window.localStorage.setItem(kitchenMetaKeys.kitchens, JSON.stringify(kitchens))
}

const loadProfiles = (): UserProfile[] => {
  try {
    const raw = window.localStorage.getItem(kitchenMetaKeys.profiles)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((profile): profile is UserProfile =>
      profile && typeof profile.id === 'string' && typeof profile.name === 'string' && typeof profile.role === 'string',
    )
  } catch {
    return []
  }
}

const saveProfiles = (profiles: UserProfile[]) => {
  window.localStorage.setItem(kitchenMetaKeys.profiles, JSON.stringify(profiles))
}

const hasLegacyData = () => {
  try {
    return (
      window.localStorage.getItem('lineflow.prepItems') !== null ||
      window.localStorage.getItem('lineflow.inventoryItems') !== null
    )
  } catch {
    return false
  }
}

// ─── Root App — kitchen selector ─────────────────

function App() {
  const [kitchens, setKitchens] = useState<KitchenProfile[]>(() => loadKitchens())
  const [profiles, setProfiles] = useState<UserProfile[]>(() => loadProfiles())
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(kitchenMetaKeys.activeProfileId)
    } catch {
      return null
    }
  })
  const [activeKitchenId, setActiveKitchenId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(kitchenMetaKeys.activeKitchenId)
    } catch {
      return null
    }
  })
  const [showSelector, setShowSelector] = useState(() => {
    const savedId = (() => {
      try { return window.localStorage.getItem(kitchenMetaKeys.activeKitchenId) } catch { return null }
    })()
    const kitchenList = loadKitchens()
    return !savedId || !kitchenList.some((k) => k.id === savedId)
  })
  const [newKitchenName, setNewKitchenName] = useState('')
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileRole, setNewProfileRole] = useState('Line Cook')
  const [joinCode, setJoinCode] = useState('')
  const [kitchenFormError, setKitchenFormError] = useState('')
  const [profileFormError, setProfileFormError] = useState('')

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null

  const updateProfileKitchen = (profileId: string, kitchenId: string | null) => {
    setProfiles((currentProfiles) => {
      const nextProfiles = currentProfiles.map((profile) =>
        profile.id === profileId ? { ...profile, kitchenId } : profile,
      )
      saveProfiles(nextProfiles)
      return nextProfiles
    })
  }

  const selectProfile = (profileId: string) => {
    const profile = profiles.find((entry) => entry.id === profileId)
    setActiveProfileId(profileId)
    window.localStorage.setItem(kitchenMetaKeys.activeProfileId, profileId)
    if (profile && profile.kitchenId) {
      setActiveKitchenId(profile.kitchenId)
      window.localStorage.setItem(kitchenMetaKeys.activeKitchenId, profile.kitchenId)
      setShowSelector(false)
      return
    }
    setShowSelector(true)
    window.localStorage.removeItem(kitchenMetaKeys.activeKitchenId)
    setActiveKitchenId(null)
  }

  const selectKitchen = (kitchenId: string) => {
    setActiveKitchenId(kitchenId)
    window.localStorage.setItem(kitchenMetaKeys.activeKitchenId, kitchenId)
    if (activeProfileId) {
      updateProfileKitchen(activeProfileId, kitchenId)
    }
    setShowSelector(false)
  }

  const handleCreateProfile = () => {
    const name = newProfileName.trim()
    if (!name) {
      setProfileFormError('Enter your name to create a profile.')
      return
    }

    const profile: UserProfile = {
      id: createRuntimeId('profile'),
      name,
      role: newProfileRole.trim() || 'Line Cook',
      kitchenId: null,
      createdAt: new Date().toISOString(),
    }

    const updated = [...profiles, profile]
    setProfiles(updated)
    saveProfiles(updated)
    setActiveProfileId(profile.id)
    window.localStorage.setItem(kitchenMetaKeys.activeProfileId, profile.id)
    setNewProfileName('')
    setNewProfileRole('Line Cook')
    setProfileFormError('')
    setShowSelector(true)
  }

  const handleJoinKitchen = () => {
    const code = joinCode.trim().toUpperCase()
    const targetKitchen = kitchens.find((kitchen) => kitchen.joinCode === code)

    if (!targetKitchen) {
      setKitchenFormError('That kitchen code was not found. Try again or create a new kitchen.')
      return
    }

    setKitchenFormError('')
    selectKitchen(targetKitchen.id)
  }

  const handleSwitchProfile = () => {
    window.localStorage.removeItem(kitchenMetaKeys.activeProfileId)
    window.localStorage.removeItem(kitchenMetaKeys.activeKitchenId)
    setActiveProfileId(null)
    setActiveKitchenId(null)
    setShowSelector(true)
  }

  const handleDeleteProfile = (profileId: string) => {
    const target = profiles.find((profile) => profile.id === profileId)
    if (!target || !window.confirm(`Delete "${target.name}" from your saved profiles?`)) {
      return
    }

    const nextProfiles = profiles.filter((profile) => profile.id !== profileId)
    setProfiles(nextProfiles)
    saveProfiles(nextProfiles)

    if (activeProfileId === profileId) {
      window.localStorage.removeItem(kitchenMetaKeys.activeProfileId)
      setActiveProfileId(null)
    }

    if (target.kitchenId && activeKitchenId === target.kitchenId) {
      window.localStorage.removeItem(kitchenMetaKeys.activeKitchenId)
      setActiveKitchenId(null)
      setShowSelector(true)
    }
  }

  const handleAddTeamMemberToKitchen = (profileId: string, kitchenId: string) => {
    const targetProfile = profiles.find((profile) => profile.id === profileId)
    if (!targetProfile) {
      return
    }

    const nextProfiles = profiles.map((profile) =>
      profile.id === targetProfile.id ? { ...profile, kitchenId } : profile,
    )
    setProfiles(nextProfiles)
    saveProfiles(nextProfiles)
  }

  const handleCreateKitchen = () => {
    const name = newKitchenName.trim()
    if (!name) {
      setKitchenFormError('Enter a name for this kitchen.')
      return
    }
    if (kitchens.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
      setKitchenFormError('A kitchen with that name already exists.')
      return
    }
    const newKitchen: KitchenProfile = {
      id: createRuntimeId('kitchen'),
      name,
      createdAt: new Date().toISOString(),
      joinCode: generateJoinCode(),
    }
    const updated = [...kitchens, newKitchen]
    setKitchens(updated)
    saveKitchens(updated)
    setNewKitchenName('')
    setKitchenFormError('')
    selectKitchen(newKitchen.id)
  }

  const handleDeleteKitchen = (kitchenId: string) => {
    const target = kitchens.find((k) => k.id === kitchenId)
    if (!target || !window.confirm(`Delete "${target.name}" and all its data? This cannot be undone.`)) return
    const keys = makeStorageKeys(kitchenId)
    Object.values(keys).forEach((k) => window.localStorage.removeItem(k))
    const updated = kitchens.filter((k) => k.id !== kitchenId)
    setKitchens(updated)
    saveKitchens(updated)
    if (activeKitchenId === kitchenId) {
      setActiveKitchenId(null)
      window.localStorage.removeItem(kitchenMetaKeys.activeKitchenId)
    }
    setProfiles((currentProfiles) => {
      const nextProfiles = currentProfiles.map((profile) =>
        profile.kitchenId === kitchenId ? { ...profile, kitchenId: null } : profile,
      )
      saveProfiles(nextProfiles)
      return nextProfiles
    })
  }

  const handleMigrateAndCreate = () => {
    const name = newKitchenName.trim()
    if (!name) { setKitchenFormError('Enter a name for this kitchen.'); return }
    const newKitchen: KitchenProfile = {
      id: createRuntimeId('kitchen'),
      name,
      createdAt: new Date().toISOString(),
      joinCode: generateJoinCode(),
    }
    const updated = [...kitchens, newKitchen]
    setKitchens(updated)
    saveKitchens(updated)
    migrateToKitchen(newKitchen.id)
    setNewKitchenName('')
    setKitchenFormError('')
    selectKitchen(newKitchen.id)
  }

  const legacyDataExists = kitchens.length === 0 && hasLegacyData()

  if (!activeProfileId) {
    return (
      <div className="kitchen-selector">
        <div className="kitchen-selector-inner">
          <p className="brand-kicker">BOH operations</p>
          <h1 className="brand-title">LineFlow</h1>
          <p className="brand-copy">Create your profile to join a kitchen team or start your own prep workspace.</p>

          {profiles.length > 0 && (
            <section className="profile-list" aria-label="Saved profiles">
              <p className="eyebrow" style={{ marginBottom: '0.65rem' }}>Saved profiles</p>
              <div className="profile-list-grid">
                {profiles.map((profile) => (
                  <div className="profile-list-row" key={profile.id}>
                    <button
                      type="button"
                      className="profile-list-item"
                      onClick={() => selectProfile(profile.id)}
                    >
                      <span className="profile-list-name">{profile.name}</span>
                      <span className="profile-list-meta">{profile.role}</span>
                    </button>
                    <button
                      className="secondary-button danger-button profile-delete-button"
                      type="button"
                      onClick={() => handleDeleteProfile(profile.id)}
                      aria-label={`Delete ${profile.name}`}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="profile-form" aria-label="Create user profile">
            <label>
              <span>Your name</span>
              <input
                className="toolbar-input"
                value={newProfileName}
                onChange={(e) => { setNewProfileName(e.target.value); setProfileFormError('') }}
                placeholder="e.g. Sam, Expo lead"
                aria-label="Profile name"
              />
            </label>
            <label>
              <span>Role</span>
              <select
                className="toolbar-select"
                value={newProfileRole}
                onChange={(e) => setNewProfileRole(e.target.value)}
                aria-label="Profile role"
              >
                <option value="Line Cook">Line Cook</option>
                <option value="Prep Cook">Prep Cook</option>
                <option value="Sous Chef">Sous Chef</option>
                <option value="Chef">Chef</option>
                <option value="Expo">Expo</option>
                <option value="Manager">Manager</option>
              </select>
            </label>
            <button className="action-button" type="button" onClick={handleCreateProfile}>
              Create profile
            </button>
            {profileFormError && (
              <p className="form-error" role="alert" style={{ marginTop: '0.5rem' }}>
                {profileFormError}
              </p>
            )}
          </section>
        </div>
      </div>
    )
  }

  if (showSelector) {
    return (
      <div className="kitchen-selector">
        <div className="kitchen-selector-inner">
          <p className="brand-kicker">BOH operations</p>
          <h1 className="brand-title">LineFlow</h1>
          <p className="brand-copy">{activeProfile ? `${activeProfile.name}, continue with your kitchen team.` : 'Choose a kitchen to load its data, or create a new one.'}</p>

          {kitchens.length > 0 && (
            <section className="kitchen-list" aria-label="Your kitchens">
              <p className="eyebrow" style={{ marginBottom: '0.65rem' }}>Your kitchens</p>
              {kitchens.map((kitchen) => (
                <div className="kitchen-list-row" key={kitchen.id}>
                  <button
                    className={`kitchen-list-item${activeKitchenId === kitchen.id ? ' kitchen-list-item--active' : ''}`}
                    type="button"
                    onClick={() => selectKitchen(kitchen.id)}
                  >
                    <span className="kitchen-list-name">{kitchen.name}</span>
                    <span className="kitchen-list-date">Join code: {kitchen.joinCode}</span>
                  </button>
                  <button
                    className="secondary-button danger-button kitchen-delete-button"
                    type="button"
                    onClick={() => handleDeleteKitchen(kitchen.id)}
                    aria-label={`Delete ${kitchen.name}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </section>
          )}

          <section className="kitchen-create-form" aria-label="Join or create a kitchen">
            <p className="eyebrow" style={{ marginBottom: '0.65rem' }}>Join my kitchen</p>
            <div className="kitchen-form-row join-kitchen-row">
              <input
                className="toolbar-input kitchen-name-input"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setKitchenFormError('') }}
                placeholder="Enter a kitchen code"
                aria-label="Kitchen join code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleJoinKitchen()
                  }
                }}
              />
              <button className="secondary-button" type="button" onClick={handleJoinKitchen}>
                Join kitchen
              </button>
            </div>

            <div className="kitchen-create-form" style={{ marginTop: '1rem' }}>
              <p className="eyebrow" style={{ marginBottom: '0.65rem' }}>
                {kitchens.length === 0 ? 'Create your first kitchen' : 'Add another kitchen'}
              </p>
              <div className="kitchen-form-row">
                <input
                  className="toolbar-input kitchen-name-input"
                  value={newKitchenName}
                  onChange={(e) => { setNewKitchenName(e.target.value); setKitchenFormError('') }}
                  placeholder="e.g. Main Kitchen, Pastry Station"
                  aria-label="Kitchen name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (legacyDataExists) {
                        handleMigrateAndCreate()
                      } else {
                        handleCreateKitchen()
                      }
                    }
                  }}
                />
                <button
                  className="action-button"
                  type="button"
                  onClick={legacyDataExists ? handleMigrateAndCreate : handleCreateKitchen}
                >
                  {legacyDataExists ? 'Create & Import Existing Data' : 'Create Kitchen'}
                </button>
              </div>
            </div>
            {legacyDataExists && kitchens.length === 0 && (
              <p className="kitchen-migrate-note">
                Existing data detected — it will be imported into the new kitchen automatically.
              </p>
            )}
            {kitchenFormError && (
              <p className="form-error" role="alert" style={{ marginTop: '0.5rem' }}>
                {kitchenFormError}
              </p>
            )}
          </section>
        </div>
      </div>
    )
  }

  if (!activeKitchenId) return null

  return (
    <Dashboard
      key={activeKitchenId}
      kitchenId={activeKitchenId}
      kitchens={kitchens}
      profiles={profiles}
      onManageKitchens={() => setShowSelector(true)}
      activeProfileName={activeProfile?.name ?? 'Profile'}
      onSwitchProfile={handleSwitchProfile}
      onAddTeamMemberToKitchen={handleAddTeamMemberToKitchen}
    />
  )
}

export default App
