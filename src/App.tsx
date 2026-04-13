import { useEffect, useRef, useState, type ChangeEvent } from 'react'
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

type AuditEntry = {
  id: string
  category: 'Prep' | 'Inventory'
  message: string
  timestamp: string
}

type AuditFilter = 'All' | AuditEntry['category']
type PrepStationFilter = 'All' | StationName
type InventoryStatusFilter = 'All' | 'OK' | 'Low' | 'Critical'

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

const recipeCategories: RecipeCategory[] = ['Sauce', 'Protein', 'Sides', 'Dessert', 'Soup', 'Salad', 'Bake', 'Other']

const initialInventoryItems: InventoryItem[] = []
const initialEightySixItems: EightySixItem[] = []
const initialShiftNotes: ShiftNote[] = []
const initialAuditEntries: AuditEntry[] = []

const legacySeededInventoryIds = new Set(['inv-1', 'inv-2', 'inv-3'])
const legacySeededEightySixIds = new Set(['eighty-six-1', 'eighty-six-2', 'eighty-six-3'])
const legacySeededShiftNoteIds = new Set(['note-1', 'note-2', 'note-3'])
const legacySeededAuditIds = new Set(['audit-1', 'audit-2'])

// Kitchen meta keys — not namespaced, shared across all kitchens
const kitchenMetaKeys = {
  kitchens: 'lineflow.kitchens',
  activeKitchenId: 'lineflow.activeKitchenId',
} as const

// Data keys namespaced per kitchen
const makeStorageKeys = (kitchenId: string) => ({
  prepItems: `lineflow.kitchen.${kitchenId}.prepItems`,
  inventoryItems: `lineflow.kitchen.${kitchenId}.inventoryItems`,
  eightySixItems: `lineflow.kitchen.${kitchenId}.eightySixItems`,
  shiftNotes: `lineflow.kitchen.${kitchenId}.shiftNotes`,
  auditEntries: `lineflow.kitchen.${kitchenId}.auditEntries`,
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
  value === 'Not Started' || value === 'In Progress' || value === 'Ready'

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

function Dashboard({ kitchenId, kitchens, onManageKitchens }: {
  kitchenId: string
  kitchens: KitchenProfile[]
  onManageKitchens: () => void
}) {
  const storageKeys = makeStorageKeys(kitchenId)
  const activeKitchen = kitchens.find((k) => k.id === kitchenId)

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
  const undoTimeoutRef = useRef<number | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)

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
      window.localStorage.setItem(storageKeys.recipes, JSON.stringify(recipes))
    }
  }, [recipes, storageKeys.recipes])

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
      status: 'Not Started',
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
    } else if (status === 'In Progress' && targetItem.status === 'Not Started') {
      announceAction(`${targetItem.name} fired on ${targetItem.station}.`)
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
    <div className="app-shell">
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
          <div className="sidebar-actions">
            <button className="secondary-button" type="button" onClick={handleExportData}>
              Export Backup
            </button>
            <button className="secondary-button" type="button" onClick={handleRequestImport}>
              Import Backup
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              onChange={handleImportFileChange}
              className="sr-only"
              tabIndex={-1}
              aria-label="Import LineFlow backup"
            />
          </div>
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

      <main id="main-content" className="dashboard">
        {!isOnline && (
          <div className="offline-banner" role="status">
            You are offline. The app is still fully functional — data is saved locally.
          </div>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">Back of House Dashboard</p>
            <h2>Keep service moving without chasing paper notes.</h2>
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
            <div className="shift-pill">
              <span>{shiftLabel}</span>
              <strong>{dateLabel}</strong>
            </div>
            <button className="action-button" type="button" onClick={handleGenerateHandoff}>
              Generate Handoff
            </button>
            <button className="secondary-button" type="button" onClick={() => window.print()}>
              Print
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
                      <span className={`status-chip status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="prep-meta">
                      <span className={`priority-chip priority-${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                      <span>Due {item.dueTime}</span>
                      {item.quantity && <span>{item.quantity}</span>}
                    </div>
                    {item.status === 'Not Started' && (
                      <div className="prep-card-fire">
                        <button
                          className="fire-button"
                          type="button"
                          onClick={() => updatePrepItemStatus(item.id, 'In Progress')}
                        >
                          Fire it →
                        </button>
                      </div>
                    )}
                    {item.status === 'In Progress' && (
                      <div className="prep-card-fire">
                        <button
                          className="done-button"
                          type="button"
                          onClick={() => updatePrepItemStatus(item.id, 'Ready')}
                        >
                          Mark Ready ✓
                        </button>
                      </div>
                    )}
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
          </section>
      </main>

      <nav className="bottom-tab-bar" aria-label="Quick navigation">
        {sectionIds.map((sectionId) => (
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
      k && typeof k.id === 'string' && typeof k.name === 'string',
    )
  } catch {
    return []
  }
}

const saveKitchens = (kitchens: KitchenProfile[]) => {
  window.localStorage.setItem(kitchenMetaKeys.kitchens, JSON.stringify(kitchens))
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
  const [kitchenFormError, setKitchenFormError] = useState('')

  const selectKitchen = (kitchenId: string) => {
    setActiveKitchenId(kitchenId)
    window.localStorage.setItem(kitchenMetaKeys.activeKitchenId, kitchenId)
    setShowSelector(false)
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
    // Clear all namespaced keys for this kitchen
    const keys = makeStorageKeys(kitchenId)
    Object.values(keys).forEach((k) => window.localStorage.removeItem(k))
    const updated = kitchens.filter((k) => k.id !== kitchenId)
    setKitchens(updated)
    saveKitchens(updated)
    if (activeKitchenId === kitchenId) {
      setActiveKitchenId(null)
      window.localStorage.removeItem(kitchenMetaKeys.activeKitchenId)
    }
  }

  // One-time migration: if legacy data exists and a new kitchen is being created, offer to migrate
  const handleMigrateAndCreate = () => {
    const name = newKitchenName.trim()
    if (!name) { setKitchenFormError('Enter a name for this kitchen.'); return }
    const newKitchen: KitchenProfile = {
      id: createRuntimeId('kitchen'),
      name,
      createdAt: new Date().toISOString(),
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

  if (showSelector) {
    return (
      <div className="kitchen-selector">
        <div className="kitchen-selector-inner">
          <p className="brand-kicker">BOH operations</p>
          <h1 className="brand-title">LineFlow</h1>
          <p className="brand-copy">Choose a kitchen to load its data, or create a new one.</p>

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
                    <span className="kitchen-list-date">
                      Created {new Date(kitchen.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
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

          <section className="kitchen-create-form" aria-label="Create new kitchen">
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
      onManageKitchens={() => setShowSelector(true)}
    />
  )
}

export default App
