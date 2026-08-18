const EARTH_RADIUS_KM = 6371;

export function calculateDistanceKm(pointA, pointB) {
  if (!isFinitePoint(pointA) || !isFinitePoint(pointB)) return null;

  const lat1 = toRadians(pointA.latitude);
  const lat2 = toRadians(pointB.latitude);
  const deltaLat = toRadians(pointB.latitude - pointA.latitude);
  const deltaLng = toRadians(pointB.longitude - pointA.longitude);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return null;
  const meters = Math.round(km * 1000);
  if (meters < 1000) return `${meters} 公尺`;
  return `${Math.round(km * 10) / 10} 公里`;
}

function isFinitePoint(point) {
  return Boolean(point) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
