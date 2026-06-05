// prototype only, not final API contract

export const mapCenter = {
  id: "nutc-sanmin-campus",
  name: "國立臺中科技大學 三民校區",
  address: "台中市北區三民路三段 129 號",
  latitude: 24.14972,
  longitude: 120.68393
};

export const mapDefaults = {
  zoom: 16,
  minimumZoom: 12,
  maximumZoom: 20
};

export const googleMapsEmbedUrl = `https://www.google.com/maps?q=${mapCenter.latitude},${mapCenter.longitude}&z=${mapDefaults.zoom}&output=embed`;
