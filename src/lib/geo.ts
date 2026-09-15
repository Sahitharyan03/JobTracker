/**
 * Tiny offline gazetteer: maps free-text location strings to coordinates
 * for the applications map. Matching is substring-based and case-
 * insensitive; unmatched locations are reported so the UI can list them.
 */

export interface GeoPoint {
  label: string;
  lat: number;
  lon: number;
  count: number;
}

const GAZETTEER: [string, number, number][] = [
  // US Major Tech Hubs & Cities
  ["san francisco", 37.77, -122.42],
  ["bay area", 37.55, -122.27],
  ["silicon valley", 37.38, -122.08],
  ["palo alto", 37.44, -122.14],
  ["mountain view", 37.39, -122.08],
  ["sunnyvale", 37.37, -122.04],
  ["san jose", 37.34, -121.89],
  ["santa clara", 37.35, -121.95],
  ["menlo park", 37.45, -122.18],
  ["redwood city", 37.48, -122.23],
  ["fremont", 37.55, -121.99],
  ["oakland", 37.80, -122.27],
  ["berkeley", 37.87, -122.27],
  ["seattle", 47.61, -122.33],
  ["bellevue", 47.61, -122.20],
  ["redmond", 47.67, -122.12],
  ["kirkland", 47.68, -122.21],
  ["new york", 40.71, -74.01],
  ["nyc", 40.71, -74.01],
  ["manhattan", 40.78, -73.97],
  ["brooklyn", 40.68, -73.94],
  ["queens", 40.73, -73.79],
  ["boston", 42.36, -71.06],
  ["cambridge", 42.37, -71.11],
  ["somerville", 42.39, -71.10],
  ["waltham", 42.38, -71.24],
  ["austin", 30.27, -97.74],
  ["dallas", 32.78, -96.80],
  ["plano", 33.02, -96.70],
  ["fort worth", 32.75, -97.33],
  ["houston", 29.76, -95.37],
  ["san antonio", 29.42, -98.49],
  ["chicago", 41.88, -87.63],
  ["los angeles", 34.05, -118.24],
  ["santa monica", 34.02, -118.49],
  ["culver city", 34.02, -118.39],
  ["pasadena", 34.15, -118.14],
  ["irvine", 33.68, -117.83],
  ["san diego", 32.72, -117.16],
  ["denver", 39.74, -104.99],
  ["boulder", 40.01, -105.27],
  ["colorado springs", 38.83, -104.82],
  ["atlanta", 33.75, -84.39],
  ["alpharetta", 34.07, -84.29],
  ["miami", 25.76, -80.19],
  ["fort lauderdale", 26.12, -80.14],
  ["washington", 38.91, -77.04],
  ["dc", 38.91, -77.04],
  ["arlington", 38.88, -77.10],
  ["alexandria", 38.80, -77.05],
  ["mclean", 38.93, -77.18],
  ["reston", 38.96, -77.36],
  ["philadelphia", 39.95, -75.17],
  ["pittsburgh", 40.44, -79.99],
  ["portland", 45.51, -122.68],
  ["phoenix", 33.45, -112.07],
  ["scottsdale", 33.49, -111.93],
  ["tempe", 33.42, -111.94],
  ["salt lake", 40.76, -111.89],
  ["lehi", 40.39, -111.85],
  ["provo", 40.23, -111.66],
  ["minneapolis", 44.98, -93.27],
  ["st. paul", 44.95, -93.09],
  ["detroit", 42.33, -83.05],
  ["nashville", 36.16, -86.78],
  ["charlotte", 35.23, -80.84],
  ["raleigh", 35.78, -78.64],
  ["durham", 35.99, -78.90],
  ["chapel hill", 35.91, -79.05],
  ["research triangle", 35.90, -78.86],
  ["columbus", 39.96, -83.00],
  ["st. louis", 38.63, -90.20],
  ["kansas city", 39.10, -94.58],
  ["madison", 43.07, -89.40],
  ["ann arbor", 42.28, -83.74],
  ["tampa", 27.95, -82.46],
  ["orlando", 28.54, -81.38],
  ["baltimore", 39.29, -76.61],
  ["jersey city", 40.73, -74.08],
  ["newark", 40.74, -74.17],
  ["sacramento", 38.58, -121.49],
  ["las vegas", 36.17, -115.14],
  ["reno", 39.53, -119.81],
  ["albuquerque", 35.08, -106.65],
  ["oklahoma city", 35.47, -97.52],
  ["tulsa", 36.15, -95.99],
  ["indianapolis", 39.77, -86.16],
  ["cincinnati", 39.10, -84.51],
  ["cleveland", 41.50, -81.69],
  ["milwaukee", 43.04, -87.91],
  ["memphis", 35.15, -90.05],
  ["new orleans", 29.95, -90.07],
  ["richmond", 37.54, -77.44],
  ["jacksonville", 30.33, -81.66],
  ["boise", 43.62, -116.20],
  ["omaha", 41.26, -95.94],
  ["des moines", 41.59, -93.60],
  ["hartford", 41.76, -72.67],
  ["providence", 41.82, -71.41],
  ["honolulu", 21.31, -157.86],
  ["anchorage", 61.22, -149.90],

  // US States (Centroids for state-level entries)
  ["california", 36.78, -119.42],
  ["texas", 31.97, -99.90],
  ["washington", 47.75, -120.74],
  ["massachusetts", 42.41, -71.38],
  ["new york state", 43.00, -75.00],
  ["florida", 27.66, -81.52],
  ["illinois", 40.63, -89.40],
  ["colorado", 39.55, -105.78],
  ["georgia", 32.17, -82.90],
  ["north carolina", 35.76, -79.02],
  ["virginia", 37.43, -78.66],
  ["pennsylvania", 41.20, -77.19],
  ["ohio", 40.42, -82.91],
  ["michigan", 44.31, -85.60],
  ["new jersey", 40.06, -74.41],
  ["arizona", 34.05, -111.09],
  ["utah", 39.32, -111.09],
  ["oregon", 43.80, -120.55],
  ["minnesota", 46.73, -94.69],
  ["tennessee", 35.52, -86.58],
  ["maryland", 39.05, -76.64],
  ["missouri", 37.96, -91.83],
  ["wisconsin", 43.78, -88.79],
  ["indiana", 40.27, -86.13],
  ["connecticut", 41.60, -72.76],
  ["nevada", 38.80, -116.42],
  ["alaska", 64.20, -149.49],
  ["hawaii", 19.90, -155.58],

  // Canada
  ["toronto", 43.65, -79.38],
  ["vancouver", 49.28, -123.12],
  ["montreal", 45.50, -73.57],
  ["ottawa", 45.42, -75.70],
  ["calgary", 51.05, -114.07],
  ["edmonton", 53.55, -113.49],
  ["waterloo", 43.46, -80.52],
  ["ontario", 51.25, -85.32],
  ["british columbia", 53.73, -127.65],

  // Europe
  ["london", 51.51, -0.13],
  ["dublin", 53.35, -6.26],
  ["berlin", 52.52, 13.41],
  ["munich", 48.14, 11.58],
  ["frankfurt", 50.11, 8.68],
  ["amsterdam", 52.37, 4.90],
  ["paris", 48.86, 2.35],
  ["zurich", 47.38, 8.54],
  ["geneva", 46.20, 6.14],
  ["stockholm", 59.33, 18.07],
  ["copenhagen", 55.68, 12.57],
  ["oslo", 59.91, 10.75],
  ["helsinki", 60.17, 24.94],
  ["madrid", 40.42, -3.70],
  ["barcelona", 41.39, 2.17],
  ["lisbon", 38.72, -9.14],
  ["warsaw", 52.23, 21.01],
  ["krakow", 50.06, 19.94],
  ["prague", 50.08, 14.44],
  ["vienna", 48.21, 16.37],

  // Asia-Pacific & Worldwide
  ["bangalore", 12.97, 77.59],
  ["bengaluru", 12.97, 77.59],
  ["hyderabad", 17.39, 78.49],
  ["chennai", 13.08, 80.27],
  ["mumbai", 19.08, 72.88],
  ["pune", 18.52, 73.86],
  ["delhi", 28.61, 77.21],
  ["gurgaon", 28.46, 77.03],
  ["gurugram", 28.46, 77.03],
  ["noida", 28.54, 77.39],
  ["singapore", 1.35, 103.82],
  ["tokyo", 35.68, 139.69],
  ["seoul", 37.57, 126.98],
  ["sydney", -33.87, 151.21],
  ["melbourne", -37.81, 144.96],
  ["brisbane", -27.47, 153.03],
  ["auckland", -36.85, 174.76],
  ["tel aviv", 32.09, 34.78],
  ["dubai", 25.20, 55.27],
  ["são paulo", -23.55, -46.63],
  ["sao paulo", -23.55, -46.63],
  ["buenos aires", -34.60, -58.38],
  ["mexico city", 19.43, -99.13],
];

export interface GeoResult {
  points: GeoPoint[];
  remoteCount: number;
  unmatched: Map<string, number>;
}

export function geolocate(locations: string[]): GeoResult {
  const points = new Map<string, GeoPoint>();
  const unmatched = new Map<string, number>();
  let remoteCount = 0;

  for (const raw of locations) {
    if (!raw) continue;
    const text = raw.trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (
      lower.includes("remote") ||
      lower.includes("anywhere") ||
      lower.includes("work from home") ||
      lower.includes("wfh") ||
      lower.includes("virtual")
    ) {
      remoteCount++;
      continue;
    }
    const hit = GAZETTEER.find(([name]) => lower.includes(name));
    if (hit) {
      const [name, lat, lon] = hit;
      const existing = points.get(name);
      if (existing) existing.count++;
      else points.set(name, { label: text, lat, lon, count: 1 });
    } else {
      unmatched.set(text, (unmatched.get(text) ?? 0) + 1);
    }
  }

  return { points: [...points.values()], remoteCount, unmatched };
}
