// Words Zambian shoppers use interchangeably. A search for any word in a group also finds the others.
export const synonymGroups = [
  ['mealie meal', 'mealie-meal', 'maize meal', 'nshima', 'breakfast meal', 'roller meal'],
  ['chitenge', 'chitenje', 'citenge', 'kitenge', 'wax print', 'african print'],
  ['phone', 'smartphone', 'cellphone', 'cell phone', 'mobile phone', 'handset'],
  ['fridge', 'refrigerator', 'freezer'],
  ['tv', 'television', 'smart tv'],
  ['solar', 'solar panel', 'pv panel'],
  ['inverter', 'ups'],
  ['battery', 'batteries', 'lithium'],
  ['diapers', 'nappies', 'pampers'],
  ['roofing', 'roofing sheet', 'iron sheet', 'ibr'],
  ['laptop', 'notebook computer', 'computer'],
  ['kapenta', 'dried fish', 'matemba'],
  ['fertiliser', 'fertilizer', 'd-compound', 'urea', 'manure'],
  ['cooking oil', 'oil', 'mafuta'],
  ['backpack', 'school bag', 'rucksack'],
  ['motorbike', 'motorcycle', 'bike'],
  ['sneakers', 'shoes', 'takkies', 'tekkies'],
  ['weave', 'hair', 'wig', 'extensions'],
  ['stove', 'cooker', 'hot plate'],
  ['earbuds', 'earphones', 'headphones'],
  ['speaker', 'sound system', 'woofer'],
  ['seed', 'seeds', 'maize seed'],
];

// Turns a search into the list of terms to match: the search itself plus any synonyms it mentions.
export function expandSearch(query) {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const terms = new Set([q]);
  for (const group of synonymGroups) {
    if (group.some((word) => q.includes(word) || (q.length >= 3 && word.startsWith(q)))) {
      group.forEach((word) => terms.add(word));
    }
  }
  return [...terms].slice(0, 20);
}
