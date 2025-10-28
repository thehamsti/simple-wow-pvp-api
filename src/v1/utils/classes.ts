export interface ClassSpec {
  id: number
  name: string
  slug: string
}

export interface PlayableClass {
  id: number
  name: string
  slug: string
  specs: ClassSpec[]
}

// Static mapping of modern World of Warcraft classes and specs.
// IDs follow the Battle.net Game Data API.
export const PLAYABLE_CLASSES: ReadonlyArray<PlayableClass> = [
  {
    id: 1,
    name: 'Warrior',
    slug: 'warrior',
    specs: [
      { id: 71, name: 'Arms', slug: 'arms' },
      { id: 72, name: 'Fury', slug: 'fury' },
      { id: 73, name: 'Protection', slug: 'protection' }
    ]
  },
  {
    id: 2,
    name: 'Paladin',
    slug: 'paladin',
    specs: [
      { id: 65, name: 'Holy', slug: 'holy' },
      { id: 66, name: 'Protection', slug: 'protection' },
      { id: 70, name: 'Retribution', slug: 'retribution' }
    ]
  },
  {
    id: 3,
    name: 'Hunter',
    slug: 'hunter',
    specs: [
      { id: 253, name: 'Beast Mastery', slug: 'beast-mastery' },
      { id: 254, name: 'Marksmanship', slug: 'marksmanship' },
      { id: 255, name: 'Survival', slug: 'survival' }
    ]
  },
  {
    id: 4,
    name: 'Rogue',
    slug: 'rogue',
    specs: [
      { id: 259, name: 'Assassination', slug: 'assassination' },
      { id: 260, name: 'Outlaw', slug: 'outlaw' },
      { id: 261, name: 'Subtlety', slug: 'subtlety' }
    ]
  },
  {
    id: 5,
    name: 'Priest',
    slug: 'priest',
    specs: [
      { id: 256, name: 'Discipline', slug: 'discipline' },
      { id: 257, name: 'Holy', slug: 'holy' },
      { id: 258, name: 'Shadow', slug: 'shadow' }
    ]
  },
  {
    id: 6,
    name: 'Death Knight',
    slug: 'death-knight',
    specs: [
      { id: 250, name: 'Blood', slug: 'blood' },
      { id: 251, name: 'Frost', slug: 'frost' },
      { id: 252, name: 'Unholy', slug: 'unholy' }
    ]
  },
  {
    id: 7,
    name: 'Shaman',
    slug: 'shaman',
    specs: [
      { id: 262, name: 'Elemental', slug: 'elemental' },
      { id: 263, name: 'Enhancement', slug: 'enhancement' },
      { id: 264, name: 'Restoration', slug: 'restoration' }
    ]
  },
  {
    id: 8,
    name: 'Mage',
    slug: 'mage',
    specs: [
      { id: 62, name: 'Arcane', slug: 'arcane' },
      { id: 63, name: 'Fire', slug: 'fire' },
      { id: 64, name: 'Frost', slug: 'frost' }
    ]
  },
  {
    id: 9,
    name: 'Warlock',
    slug: 'warlock',
    specs: [
      { id: 265, name: 'Affliction', slug: 'affliction' },
      { id: 266, name: 'Demonology', slug: 'demonology' },
      { id: 267, name: 'Destruction', slug: 'destruction' }
    ]
  },
  {
    id: 10,
    name: 'Monk',
    slug: 'monk',
    specs: [
      { id: 268, name: 'Brewmaster', slug: 'brewmaster' },
      { id: 270, name: 'Mistweaver', slug: 'mistweaver' },
      { id: 269, name: 'Windwalker', slug: 'windwalker' }
    ]
  },
  {
    id: 11,
    name: 'Druid',
    slug: 'druid',
    specs: [
      { id: 102, name: 'Balance', slug: 'balance' },
      { id: 103, name: 'Feral', slug: 'feral' },
      { id: 104, name: 'Guardian', slug: 'guardian' },
      { id: 105, name: 'Restoration', slug: 'restoration' }
    ]
  },
  {
    id: 12,
    name: 'Demon Hunter',
    slug: 'demon-hunter',
    specs: [
      { id: 577, name: 'Havoc', slug: 'havoc' },
      { id: 581, name: 'Vengeance', slug: 'vengeance' }
    ]
  },
  {
    id: 13,
    name: 'Evoker',
    slug: 'evoker',
    specs: [
      { id: 1467, name: 'Devastation', slug: 'devastation' },
      { id: 1468, name: 'Preservation', slug: 'preservation' },
      { id: 1473, name: 'Augmentation', slug: 'augmentation' }
    ]
  }
]

const classById = new Map(PLAYABLE_CLASSES.map((cls) => [cls.id, cls]))
const classBySlug = new Map(PLAYABLE_CLASSES.map((cls) => [cls.slug, cls]))

const specById = new Map<number, { spec: ClassSpec; classRef: PlayableClass }>()
const specBySlug = new Map<string, { spec: ClassSpec; classRef: PlayableClass }>()

for (const playableClass of PLAYABLE_CLASSES) {
  for (const spec of playableClass.specs) {
    specById.set(spec.id, { spec, classRef: playableClass })
    specBySlug.set(`${playableClass.slug}:${spec.slug}`, { spec, classRef: playableClass })
  }
}

export function getClassById(id: number) {
  return classById.get(id)
}

export function getClassBySlug(slug: string) {
  return classBySlug.get(slug)
}

export function getSpecById(id: number) {
  return specById.get(id)
}

export function getSpecBySlugs(classSlug: string, specSlug: string) {
  return specBySlug.get(`${classSlug}:${specSlug}`)
}

export function listClassSlugs(): string[] {
  return PLAYABLE_CLASSES.map((cls) => cls.slug)
}

export function listSpecSlugs(classSlug?: string): string[] {
  if (!classSlug) {
    const unique = new Set<string>()
    for (const playableClass of PLAYABLE_CLASSES) {
      for (const spec of playableClass.specs) {
        unique.add(spec.slug)
      }
    }
    return Array.from(unique)
  }

  const playableClass = classBySlug.get(classSlug)
  if (!playableClass) {
    return []
  }
  return playableClass.specs.map((spec) => spec.slug)
}
