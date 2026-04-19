import { insertMyNotification } from '@/notification-insert';
import { supabase } from '@/supabase';

export function getLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, delta: number): string {
  const [y, mo, da] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, da + delta);
  return getLocalDateString(dt);
}

export function getTodayRangeISO() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function consecutiveDaysEndingYesterday(attendanceSet: Set<string>, todayStr: string): number {
  let streak = 0;
  let cursor = addDays(todayStr, -1);
  while (attendanceSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 로그인 직후 출석 자동 지급 결과 */
export type LoginAttendanceResult =
  | { granted: false; reason: 'already_attended' }
  | { granted: false; reason: 'error' }
  | { granted: true; pointsAwarded: 5 | 25 };

/**
 * 로그인 직후: 오늘 출석 없으면 attendances 추가, +5p 및 7일 연속 시 +20p (별도 로그).
 * 예외는 삼키고 `reason: 'error'`로 반환.
 */
export async function grantAttendanceIfNeededOnLogin(userId: string): Promise<LoginAttendanceResult> {
  try {
    const todayStr = getLocalDateString(new Date());

    const { data: attRows, error: fetchErr } = await supabase
      .from('attendances')
      .select('attended_at')
      .eq('user_id', userId);
    if (fetchErr) return { granted: false, reason: 'error' };

    const dates = new Set(
      (attRows ?? []).map((r: { attended_at?: string }) => String(r.attended_at ?? '').slice(0, 10))
    );
    if (dates.has(todayStr)) return { granted: false, reason: 'already_attended' };

    const streakBefore = consecutiveDaysEndingYesterday(dates, todayStr);

    const { error: insErr } = await supabase.from('attendances').insert({
      user_id: userId,
      attended_at: todayStr,
    });
    if (insErr) return { granted: false, reason: 'error' };

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('points')
      .eq('id', userId)
      .maybeSingle();
    if (meError) return { granted: false, reason: 'error' };

    const cur =
      typeof (me as { points?: number } | null)?.points === 'number' ? (me as { points: number }).points : 0;

    let next = cur + 5;
    const logs: { user_id: string; amount: number; reason: string }[] = [
      { user_id: userId, amount: 5, reason: 'attendance' },
    ];
    if (streakBefore === 6) {
      next += 20;
      logs.push({ user_id: userId, amount: 20, reason: 'attendance' });
    }

    const { error: upErr } = await supabase.from('users').update({ points: next }).eq('id', userId);
    if (upErr) return { granted: false, reason: 'error' };

    const { error: logErr } = await supabase.from('point_logs').insert(logs);
    if (logErr) return { granted: false, reason: 'error' };

    const pointsAwarded: 5 | 25 = streakBefore === 6 ? 25 : 5;
    await insertMyNotification({
      userId,
      type: 'point',
      content:
        pointsAwarded === 25 ? '출석 체크 +25p 적립됐어요' : '출석 체크 +5p 적립됐어요',
    });

    return { granted: true, pointsAwarded };
  } catch {
    return { granted: false, reason: 'error' };
  }
}
