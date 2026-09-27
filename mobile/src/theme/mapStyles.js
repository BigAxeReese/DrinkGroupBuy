import { darkMapColors as c } from "./tokens";

// Google Maps night style, tinted to the app's dark palette (values in tokens.js `darkMapColors`). The same
// array works for react-native-maps (`customMapStyle`) and the Maps JavaScript API (`styles`).
export const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: c.land }] },
  { elementType: "labels.text.fill", stylers: [{ color: c.labelText }] },
  { elementType: "labels.text.stroke", stylers: [{ color: c.labelStroke }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: c.boundary }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: c.locality }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: c.labelText }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: c.park }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: c.parkText }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: c.road }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: c.labelStroke }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: c.labelText }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: c.highway }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: c.land }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: c.highwayText }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: c.transit }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: c.labelText }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: c.water }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: c.waterText }] }
];

// The default (light) map: an empty style, kept as one constant so the map is not handed a new array on
// every render.
export const LIGHT_MAP_STYLE = [];
