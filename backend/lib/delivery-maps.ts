export function deliveryMapLinks(address: string) {
  const query = new URLSearchParams({ api: "1", query: `${address}, Bangladesh` });
  const directions = new URLSearchParams({
    api: "1",
    destination: `${address}, Bangladesh`,
    travelmode: "driving",
    dir_action: "navigate",
  });
  return {
    map: `https://www.google.com/maps/search/?${query}`,
    directions: `https://www.google.com/maps/dir/?${directions}`,
  };
}
