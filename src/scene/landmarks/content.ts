/**
 * Curated landmark identity for major Pune places.
 * Only entries with verifiable public sources. Coordinates come from the baked
 * scene preset/landmark at runtime — this file does not hardcode lon/lat.
 *
 * Images: none embedded yet (usage rights not cleared). External references only.
 */

export type LandmarkVerification = "verified" | "needs_review";

export interface LandmarkContent {
  /** Matches manifest preset label or landmark name (case-insensitive). */
  id: string;
  name_en: string;
  name_mr?: string;
  category: string;
  /** One short paragraph — factual, attributable. */
  summary_en: string;
  sources: { label: string; url: string }[];
  verification: LandmarkVerification;
  /** Optional OSM / Wikidata ids when known from public docs. */
  wikidata?: string;
  osm?: string;
}

/**
 * Priority landmarks for recognisable Pune. Summaries are short public-domain
 * style facts; always open the cited page for full context.
 */
export const LANDMARK_CONTENT: LandmarkContent[] = [
  {
    id: "Shaniwar Wada",
    name_en: "Shaniwar Wada",
    name_mr: "शनिवार वाडा",
    category: "Heritage fortification",
    summary_en:
      "18th-century fortification of the Peshwas in old Pune. The surviving gate and walls are a major civic landmark; the palace buildings were largely destroyed by fire in 1828.",
    sources: [
      { label: "Wikipedia — Shaniwar Wada", url: "https://en.wikipedia.org/wiki/Shaniwar_Wada" },
    ],
    verification: "verified",
    wikidata: "Q1148025",
  },
  {
    id: "Aga Khan Palace",
    name_en: "Aga Khan Palace",
    name_mr: "आगा खान पॅलेस",
    category: "Heritage palace / museum",
    summary_en:
      "Built in 1892 by Sultan Muhammed Shah Aga Khan III. Later used to intern Mahatma Gandhi, Kasturba Gandhi and others (1942–44). Now a national monument and museum.",
    sources: [
      { label: "Wikipedia — Aga Khan Palace", url: "https://en.wikipedia.org/wiki/Aga_Khan_Palace" },
    ],
    verification: "verified",
    wikidata: "Q390707",
  },
  {
    id: "Dagdusheth Ganpati",
    name_en: "Shreemant Dagdusheth Halwai Ganpati Temple",
    name_mr: "श्रीमंत डगडूशेठ हलवाई गणपती",
    category: "Temple",
    summary_en:
      "Well-known Ganesh temple in Budhwar Peth, established in the late 19th century. A major destination during Ganesh Chaturthi.",
    sources: [
      {
        label: "Wikipedia — Dagadusheth Halwai Ganapati Temple",
        url: "https://en.wikipedia.org/wiki/Dagadusheth_Halwai_Ganapati_Temple",
      },
    ],
    verification: "verified",
    wikidata: "Q5208458",
  },
  {
    id: "Pataleshwar",
    name_en: "Pataleshwar Cave Temple",
    name_mr: "पाताळेश्वर लेणी",
    category: "Rock-cut temple",
    summary_en:
      "8th-century rock-cut cave temple dedicated to Shiva, on Jangli Maharaj Road. Protected archaeological site with a circular Nandi mandapa.",
    sources: [
      {
        label: "Wikipedia — Pataleshwar cave temple",
        url: "https://en.wikipedia.org/wiki/Pataleshwar_cave_temple",
      },
    ],
    verification: "verified",
    wikidata: "Q7142214",
  },
  {
    id: "Pune Station",
    name_en: "Pune Junction railway station",
    name_mr: "पुणे रेल्वे स्थानक",
    category: "Railway station",
    summary_en:
      "Main railway station of Pune (station code PUNE), on the Mumbai–Chennai and other trunk routes. Position in the scene follows OpenStreetMap.",
    sources: [
      {
        label: "Wikipedia — Pune Junction railway station",
        url: "https://en.wikipedia.org/wiki/Pune_Junction_railway_station",
      },
    ],
    verification: "verified",
    wikidata: "Q7260127",
  },
  {
    id: "Sarasbaug",
    name_en: "Sarasbaug",
    name_mr: "सरसबाग",
    category: "Park / temple precinct",
    summary_en:
      "Historic garden and Ganesh temple precinct south of the old city, established under the Peshwas and later landscaped as a public park.",
    sources: [{ label: "Wikipedia — Sarasbaug", url: "https://en.wikipedia.org/wiki/Sarasbaug" }],
    verification: "verified",
    wikidata: "Q7423267",
  },
  {
    id: "Parvati",
    name_en: "Parvati Hill",
    name_mr: "पर्वती",
    category: "Hill / temple complex",
    summary_en:
      "Hill temple complex overlooking the city. Temples date from the Peshwa period; the site is a major viewpoint and heritage precinct.",
    sources: [
      { label: "Wikipedia — Parvati Hill", url: "https://en.wikipedia.org/wiki/Parvati_Hill" },
    ],
    verification: "verified",
    wikidata: "Q7141223",
  },
  {
    id: "Sinhgad Fort",
    name_en: "Sinhagad Fort",
    name_mr: "सिंहगड",
    category: "Hill fort",
    summary_en:
      "Hill fort southwest of Pune, historically Kondhana. Associated with Tanaji Malusare (1670) and later Maratha–Mughal conflicts. Accessible as a day trek and heritage site.",
    sources: [
      { label: "Wikipedia — Sinhagad", url: "https://en.wikipedia.org/wiki/Sinhagad" },
    ],
    verification: "verified",
    wikidata: "Q1526462",
  },
  {
    id: "Nehru Stadium",
    name_en: "Jawaharlal Nehru Stadium (Pune)",
    category: "Stadium",
    summary_en:
      "Multi-purpose stadium in the city; listed in OpenStreetMap as a leisure=stadium footprint used for the procedural bowl in the 3D scene.",
    sources: [
      {
        label: "Wikipedia — Jawaharlal Nehru Stadium, Pune",
        url: "https://en.wikipedia.org/wiki/Jawaharlal_Nehru_Stadium,_Pune",
      },
    ],
    verification: "verified",
  },
];

const BY_KEY = new Map<string, LandmarkContent>();
for (const row of LANDMARK_CONTENT) {
  BY_KEY.set(row.id.toLowerCase(), row);
  BY_KEY.set(row.name_en.toLowerCase(), row);
}

export function landmarkContentFor(name: string | null | undefined): LandmarkContent | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (BY_KEY.has(key)) return BY_KEY.get(key)!;
  for (const row of LANDMARK_CONTENT) {
    if (key.includes(row.id.toLowerCase()) || row.id.toLowerCase().includes(key)) return row;
  }
  return null;
}
