// Order details travel in the refund link so the page also works when the email is
// opened on another device, where localStorage has no record of the order.
export const encodeOrder = (order) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(order))));

export function decodeOrder(value) {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0))));
  } catch {
    return null;
  }
}
