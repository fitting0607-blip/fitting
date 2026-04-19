/** 로그인 직후 홈 탭에서 출석 축하 모달을 띄우기 위한 1회성 대기 값 */

let pendingPoints: 5 | 25 | null = null;

export function enqueueLoginAttendanceModal(points: 5 | 25) {
  pendingPoints = points;
}

export function peekLoginAttendanceModalPoints(): 5 | 25 | null {
  return pendingPoints;
}

export function clearLoginAttendanceModalPoints() {
  pendingPoints = null;
}
