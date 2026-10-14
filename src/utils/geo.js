// The phone's current position, rounded to about 10 m, as { lat, lng }. Rejects with a message people understand.
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This phone or browser can't share its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: Math.round(p.coords.latitude * 1e4) / 1e4,
          lng: Math.round(p.coords.longitude * 1e4) / 1e4,
        }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? 'Location was not allowed. Allow it for this site in your browser settings and try again.'
              : "Couldn't find your location. Turn on location (GPS) and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

// A Google Maps link to a position.
export const mapLink = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// "~8 km (estimate)" or "4.3 km" for a delivery quote priced by distance.
export const distanceLabel = (q) => (q?.km == null ? '' : q.estimated ? `about ${q.km} km (estimate)` : `${q.km} km`);
