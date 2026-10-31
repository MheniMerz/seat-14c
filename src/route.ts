/**
 * The route every user flies: fictional destinations at cumulative mileage,
 * laid out on a 2D map (arbitrary units, +x east, +y south). The first one
 * is close enough that a first 5-minute flight (40 miles) reaches it.
 */
export type Destination = {
  name: string;
  miles: number;
  x: number;
  y: number;
};

export const ROUTE: readonly Destination[] = [
  { name: 'Gate 14', miles: 0, x: 0, y: 0 },
  { name: 'Harbor Point', miles: 40, x: 60, y: -30 },
  { name: 'Juniper Falls', miles: 120, x: 150, y: 20 },
  { name: 'Saltmarsh', miles: 250, x: 260, y: -40 },
  { name: 'Cobalt Bay', miles: 450, x: 390, y: 30 },
  { name: 'Ember Ridge', miles: 700, x: 520, y: -60 },
  { name: 'Lanternport', miles: 1000, x: 680, y: 10 },
  { name: 'Mistral Isles', miles: 1400, x: 830, y: -70 },
  { name: 'Aurora Station', miles: 1900, x: 1000, y: 20 },
  { name: 'Velvet Dunes', miles: 2500, x: 1180, y: -50 },
  { name: 'Glass Harbor', miles: 3200, x: 1360, y: 40 },
  { name: 'Summit City', miles: 4000, x: 1560, y: -30 },
];

const LAST = ROUTE[ROUTE.length - 1];

/** Index of the last destination at or below `miles`. */
export function legIndex(miles: number): number {
  let index = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    if (ROUTE[i].miles <= miles) index = i;
  }
  return index;
}

/** Map position after flying `miles`, following the route's legs. */
export function positionAt(miles: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  if (miles >= LAST.miles) {
    out.x = LAST.x;
    out.y = LAST.y;
    return out;
  }
  const from = ROUTE[legIndex(miles)];
  const to = ROUTE[legIndex(miles) + 1];
  const t = (miles - from.miles) / (to.miles - from.miles);
  out.x = from.x + (to.x - from.x) * t;
  out.y = from.y + (to.y - from.y) * t;
  return out;
}

/** The next destination still ahead, or null once the route is complete. */
export function nextDestination(miles: number): Destination | null {
  return ROUTE.find((d) => d.miles > miles) ?? null;
}

/** Destinations passed when flying from `before` to `after` miles. */
export function destinationsBetween(before: number, after: number): Destination[] {
  return ROUTE.filter((d) => d.miles > before && d.miles <= after);
}
