export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(timeArr: number[]): string {
  if (!timeArr || timeArr.length === 0) return "N/A";
  const hour = timeArr[0];
  const min = timeArr[1] || 0;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${hours}h ${minutes}m`;
}

export function calculateLayoverDuration(arrivalTime: string, departureTime: string): string {
  const arrParts = arrivalTime.split(":").map(Number);
  const depParts = departureTime.split(":").map(Number);
  
  if (arrParts.length < 2 || depParts.length < 2) return "";
  
  const arrMins = (arrParts[0] || 0) * 60 + (arrParts[1] || 0);
  let depMins = (depParts[0] || 0) * 60 + (depParts[1] || 0);
  
  if (depMins < arrMins) {
    depMins += 24 * 60;
  }
  
  const layoverMins = depMins - arrMins;
  return formatDuration(layoverMins);
}

export function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
