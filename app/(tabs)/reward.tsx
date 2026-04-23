import Feather from '@expo/vector-icons/Feather';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Image as RNImage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  consecutiveDaysEndingYesterday,
  getLocalDateString,
  getTodayRangeISO,
} from '@/attendance-helpers';
import { insertMyNotification } from '@/notification-insert';
import { supabase } from '@/supabase';

const MAIN = '#6C47FF';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_RATIO = 240 / 670;
const BANNER_WRAP_PADDING_BOTTOM = 14;

type Banner = {
  id: string;
  image_url: string;
  click_url: string | null;
};

export default function RewardScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const [points, setPoints] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceDone, setAttendanceDone] = useState(false);
  const [adWatchToday, setAdWatchToday] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);

  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [exchangeBusy, setExchangeBusy] = useState(false);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const bannerListRef = React.useRef<FlatList<Banner> | null>(null);
  const bannerTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const bannerHeight = useMemo(() => {
    return Math.round(SCREEN_WIDTH * BANNER_RATIO);
  }, []);

  const loadBanners = useCallback(async (): Promise<Banner[]> => {
    const { data, error } = await supabase
      .from('banners')
      .select('id,image_url,click_url,is_active,created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const list = (Array.isArray(data) ? data : [])
      .map((r: any) => ({
        id: String(r?.id ?? '').trim(),
        image_url: String(r?.image_url ?? '').trim(),
        click_url: r?.click_url ? String(r.click_url).trim() : null,
      }))
      .filter((r) => r.id.length > 0 && r.image_url.length > 0);

    return list;
  }, []);

  const clearBannerTimer = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const scheduleNextBanner = useCallback(() => {
    clearBannerTimer();
    if (banners.length <= 1) return;
    bannerTimerRef.current = setTimeout(() => {
      const next = (currentBannerIndex + 1) % banners.length;
      try {
        bannerListRef.current?.scrollToOffset({
          offset: SCREEN_WIDTH * next,
          animated: true,
        });
      } catch {
        // ignore
      }
      scheduleNextBanner();
    }, 3000);
  }, [banners.length, clearBannerTimer, currentBannerIndex]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await loadBanners();
        if (!mounted) return;
        setBanners(list);
        setCurrentBannerIndex(0);
      } catch {
        if (!mounted) return;
        setBanners([]);
        setCurrentBannerIndex(0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadBanners]);

  useEffect(() => {
    scheduleNextBanner();
    return () => clearBannerTimer();
  }, [banners.length, scheduleNextBanner, clearBannerTimer]);

  const onBannerMomentumEnd = useCallback(
    (e: any) => {
      const x = e?.nativeEvent?.contentOffset?.x ?? 0;
      const idx = Math.round(x / SCREEN_WIDTH);
      setCurrentBannerIndex(Math.max(0, Math.min(idx, Math.max(0, banners.length - 1))));
      scheduleNextBanner();
    },
    [banners.length, scheduleNextBanner]
  );

  const onBannerScrollBeginDrag = useCallback(() => {
    scheduleNextBanner();
  }, [scheduleNextBanner]);

  const renderBanner = useCallback(
    ({ item }: { item: Banner }) => {
      return (
        <Pressable
          onPress={() => {
            const url = item.click_url?.trim();
            if (!url) return;
            void (async () => {
              try {
                await Linking.openURL(url);
              } catch (e: any) {
                Alert.alert('이동 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
              }
            })();
          }}
          style={[styles.bannerCard, { width: SCREEN_WIDTH, height: bannerHeight }]}
          accessibilityRole={item.click_url ? 'button' : 'image'}
          accessibilityLabel="리워드 배너"
        >
          <RNImage
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <View style={styles.bannerImageOverlay} />

          {banners.length > 1 ? (
            <View style={styles.bannerDots} pointerEvents="none">
              {banners.map((_, i) => (
                <View
                  key={`dot_${i}`}
                  style={[
                    styles.bannerDot,
                    i === currentBannerIndex ? styles.bannerDotActive : styles.bannerDotInactive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [bannerHeight, banners, currentBannerIndex]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setUserId(null);
        setPoints(null);
        setMatchingTickets(null);
        setAttendanceDone(false);
        setAdWatchToday(0);
        setInviteCount(0);
        return;
      }

      setUserId(user.id);

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points,matching_tickets')
        .eq('id', user.id)
        .maybeSingle();
      if (meError) throw meError;
      const row = me as { points?: number; matching_tickets?: number } | null;
      setPoints(typeof row?.points === 'number' ? row.points : 0);
      setMatchingTickets(typeof row?.matching_tickets === 'number' ? row.matching_tickets : 0);

      const todayStr = getLocalDateString(new Date());

      const { data: attRows, error: attErr } = await supabase
        .from('attendances')
        .select('attended_at')
        .eq('user_id', user.id);
      if (attErr) throw attErr;

      const dates = new Set(
        (attRows ?? []).map((r: { attended_at?: string }) => String(r.attended_at ?? '').slice(0, 10))
      );
      setAttendanceDone(dates.has(todayStr));

      const { startISO, endISO } = getTodayRangeISO();
      const { count: adCount, error: adErr } = await supabase
        .from('point_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('reason', 'ad_watch')
        .gte('created_at', startISO)
        .lt('created_at', endISO);
      if (adErr) throw adErr;
      setAdWatchToday(adCount ?? 0);

      const { count: invCount, error: invErr } = await supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_id', user.id);
      if (invErr) throw invErr;
      setInviteCount(invCount ?? 0);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      setPoints(null);
      setMatchingTickets(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const goToStore = useCallback(() => {
    router.push('/store');
  }, [router]);

  const onExchangeTicket = useCallback(async () => {
    if (!userId || exchangeBusy) return;
    setExchangeBusy(true);
    try {
      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points,matching_tickets')
        .eq('id', userId)
        .maybeSingle();
      if (meError) throw meError;
      const row = me as { points?: number; matching_tickets?: number } | null;
      const curPoints = typeof row?.points === 'number' ? row.points : 0;
      const curTickets = typeof row?.matching_tickets === 'number' ? row.matching_tickets : 0;

      if (curPoints < 50) {
        Alert.alert('포인트 부족', '매칭권 교환에는 50포인트가 필요해요.');
        return;
      }

      const { error: upErr } = await supabase
        .from('users')
        .update({
          points: curPoints - 50,
          matching_tickets: curTickets + 1,
        })
        .eq('id', userId);
      if (upErr) throw upErr;

      const { error: logErr } = await supabase.from('point_logs').insert({
        user_id: userId,
        amount: -50,
        reason: 'ticket_exchange',
      });
      if (logErr) throw logErr;

      await insertMyNotification({
        userId,
        type: 'point',
        content: '포인트 50p로 매칭권 1개 교환됐어요',
      });

      setPoints(curPoints - 50);
      setMatchingTickets(curTickets + 1);
      Alert.alert('교환 완료', '매칭권 1개를 받았어요.');
    } catch (e: any) {
      Alert.alert('교환 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setExchangeBusy(false);
    }
  }, [userId, exchangeBusy]);

  const onAttendance = useCallback(async () => {
    if (!userId || attendanceDone || attendanceBusy) return;
    setAttendanceBusy(true);
    try {
      const todayStr = getLocalDateString(new Date());

      const { data: attRows, error: fetchErr } = await supabase
        .from('attendances')
        .select('attended_at')
        .eq('user_id', userId);
      if (fetchErr) throw fetchErr;

      const dates = new Set(
        (attRows ?? []).map((r: { attended_at?: string }) => String(r.attended_at ?? '').slice(0, 10))
      );
      if (dates.has(todayStr)) {
        setAttendanceDone(true);
        Alert.alert('출석 완료', '오늘은 이미 출석했어요.');
        return;
      }

      const streakBefore = consecutiveDaysEndingYesterday(dates, todayStr);
      const amount = streakBefore === 6 ? 25 : 5;

      const { error: insErr } = await supabase.from('attendances').insert({
        user_id: userId,
        attended_at: todayStr,
      });
      if (insErr) throw insErr;

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points')
        .eq('id', userId)
        .maybeSingle();
      if (meError) throw meError;
      const cur =
        typeof (me as { points?: number } | null)?.points === 'number' ? (me as any).points : 0;

      const { error: upErr } = await supabase.from('users').update({ points: cur + amount }).eq('id', userId);
      if (upErr) throw upErr;

      const { error: logErr } = await supabase.from('point_logs').insert({
        user_id: userId,
        amount,
        reason: 'attendance',
      });
      if (logErr) throw logErr;

      await insertMyNotification({
        userId,
        type: 'point',
        content:
          amount === 25 ? '출석 체크 +25p 적립됐어요' : '출석 체크 +5p 적립됐어요',
      });

      setPoints(cur + amount);
      setAttendanceDone(true);
      Alert.alert(
        '출석 완료',
        streakBefore === 6
          ? `7일 연속 출석! ${amount}포인트가 적립됐어요.`
          : `${amount}포인트가 적립됐어요.`
      );
    } catch (e: any) {
      Alert.alert('출석 처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setAttendanceBusy(false);
    }
  }, [userId, attendanceDone, attendanceBusy]);

  const onAdWatch = useCallback(async () => {
    if (!userId || adWatchToday >= 4 || adBusy) return;
    setAdBusy(true);
    try {
      const { startISO, endISO } = getTodayRangeISO();
      const { count: cnt, error: cErr } = await supabase
        .from('point_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('reason', 'ad_watch')
        .gte('created_at', startISO)
        .lt('created_at', endISO);
      if (cErr) throw cErr;
      if ((cnt ?? 0) >= 4) {
        setAdWatchToday(4);
        Alert.alert('안내', '오늘 광고 시청 보상은 모두 받았어요.');
        return;
      }

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points')
        .eq('id', userId)
        .maybeSingle();
      if (meError) throw meError;
      const cur =
        typeof (me as { points?: number } | null)?.points === 'number' ? (me as any).points : 0;

      const { error: upErr } = await supabase.from('users').update({ points: cur + 10 }).eq('id', userId);
      if (upErr) throw upErr;

      const { error: logErr } = await supabase.from('point_logs').insert({
        user_id: userId,
        amount: 10,
        reason: 'ad_watch',
      });
      if (logErr) throw logErr;

      setPoints(cur + 10);
      setAdWatchToday((n) => n + 1);
      Alert.alert('적립 완료', '10포인트가 적립됐어요.');
    } catch (e: any) {
      Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setAdBusy(false);
    }
  }, [userId, adWatchToday, adBusy]);

  const onInvite = useCallback(async () => {
    if (!userId || inviteCount >= 5 || inviteBusy) return;
    setInviteBusy(true);
    try {
      const { count: cnt, error: cErr } = await supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('inviter_id', userId);
      if (cErr) throw cErr;
      if ((cnt ?? 0) >= 5) {
        setInviteCount(5);
        Alert.alert('안내', '친구 초대 보상은 최대 5명까지 받을 수 있어요.');
        return;
      }

      const inviteUrl = Linking.createURL('/register', {
        scheme: 'fitting',
        queryParams: { ref: userId },
      });

      const message = `fitting에서 함께 운동해요!\n${inviteUrl}`;

      const result = await Share.share(
        Platform.OS === 'android'
          ? { message, title: 'fitting 친구 초대' }
          : { message, url: inviteUrl }
      );

      if (result.action !== Share.sharedAction) return;

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points')
        .eq('id', userId)
        .maybeSingle();
      if (meError) throw meError;
      const cur =
        typeof (me as { points?: number } | null)?.points === 'number' ? (me as any).points : 0;

      const { error: invInsErr } = await supabase.from('invites').insert({ inviter_id: userId });
      if (invInsErr) throw invInsErr;

      const { error: upErr } = await supabase.from('users').update({ points: cur + 30 }).eq('id', userId);
      if (upErr) throw upErr;

      const { error: logErr } = await supabase.from('point_logs').insert({
        user_id: userId,
        amount: 30,
        reason: 'invite',
      });
      if (logErr) throw logErr;

      setPoints(cur + 30);
      setInviteCount((n) => n + 1);
      Alert.alert('적립 완료', '30포인트가 적립됐어요.');
    } catch (e: any) {
      Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setInviteBusy(false);
    }
  }, [userId, inviteCount, inviteBusy]);

  const adDisabled = adWatchToday >= 4;
  const inviteDisabled = inviteCount >= 5;
  const exchangeDisabled = (points ?? 0) < 50;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>리워드</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={MAIN} />
        </View>
      ) : !userId ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>로그인 후 이용할 수 있어요.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {banners.length > 0 ? (
            <View style={[styles.bannerWrap, { height: bannerHeight + BANNER_WRAP_PADDING_BOTTOM }]}>
              <FlatList
                ref={(ref) => {
                  bannerListRef.current = ref;
                }}
                data={banners}
                keyExtractor={(item) => item.id}
                renderItem={renderBanner}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                bounces={false}
                onMomentumScrollEnd={onBannerMomentumEnd}
                onScrollBeginDrag={onBannerScrollBeginDrag}
                snapToInterval={SCREEN_WIDTH}
                snapToAlignment="start"
                disableIntervalMomentum
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
              />
            </View>
          ) : null}

          <View style={styles.topCard}>
            <View style={styles.topCardCol}>
              <Text style={styles.topCardLabel}>보유 매칭권</Text>
              <Text style={styles.topCardValue}>{matchingTickets ?? 0}개</Text>
            </View>
            <View style={styles.topCardDivider} />
            <View style={styles.topCardCol}>
              <Text style={styles.topCardLabel}>보유 포인트</Text>
              <Text style={styles.topCardValue}>{points ?? 0}p</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>상점</Text>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconWrap}>
                <Feather name="shopping-bag" size={22} color={MAIN} />
              </View>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>매칭권 구매</Text>
                <Text style={styles.cardDesc}>스토어에서 매칭권을 구매할 수 있어요.</Text>
              </View>
            </View>
            <Pressable
              onPress={goToStore}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            >
              <Text style={styles.secondaryBtnText}>매칭권 구매</Text>
            </Pressable>

            <View style={styles.shopDivider} />

            <Text style={styles.subsectionTitle}>포인트 → 매칭권 교환</Text>
            <Text style={styles.cardDesc}>50포인트를 사용해 매칭권 1개로 교환해요.</Text>
            <Pressable
              onPress={onExchangeTicket}
              disabled={exchangeDisabled || exchangeBusy}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.primaryBtnSpacing,
                (exchangeDisabled || exchangeBusy) && styles.btnDisabled,
                pressed && !exchangeDisabled && !exchangeBusy && styles.primaryBtnPressed,
              ]}
            >
              {exchangeBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {exchangeDisabled ? '포인트 부족 (50p 필요)' : '50p로 매칭권 1개 교환'}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>미션</Text>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconWrap}>
                <Feather name="video" size={22} color={MAIN} />
              </View>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>광고 시청</Text>
                <Text style={styles.cardDesc}>시청당 +10p · 오늘 {adWatchToday}/4회</Text>
              </View>
            </View>
            <Pressable
              onPress={onAdWatch}
              disabled={adDisabled || adBusy}
              style={({ pressed }) => [
                styles.primaryBtn,
                (adDisabled || adBusy) && styles.btnDisabled,
                pressed && !adDisabled && !adBusy && styles.primaryBtnPressed,
              ]}
            >
              {adBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>{adDisabled ? '오늘 한도 초과' : '광고 시청하고 받기'}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconWrap}>
                <Feather name="user-plus" size={22} color={MAIN} />
              </View>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>친구 초대</Text>
                <Text style={styles.cardDesc}>초대당 +30p · {inviteCount}/5명</Text>
              </View>
            </View>
            <Pressable
              onPress={onInvite}
              disabled={inviteDisabled || inviteBusy}
              style={({ pressed }) => [
                styles.primaryBtn,
                (inviteDisabled || inviteBusy) && styles.btnDisabled,
                pressed && !inviteDisabled && !inviteBusy && styles.primaryBtnPressed,
              ]}
            >
              {inviteBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {inviteDisabled ? '초대 보상 완료' : '초대 링크 공유'}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconWrap}>
                <Feather name="calendar" size={22} color={MAIN} />
              </View>
              <View style={styles.cardTextCol}>
                <Text style={styles.cardTitle}>출석 체크</Text>
                <Text style={styles.cardDesc}>매일 +5p · 7일 연속 시 +25p</Text>
              </View>
            </View>
            <Pressable
              onPress={onAttendance}
              disabled={attendanceDone || attendanceBusy}
              style={({ pressed }) => [
                styles.primaryBtn,
                (attendanceDone || attendanceBusy) && styles.btnDisabled,
                pressed && !attendanceDone && !attendanceBusy && styles.primaryBtnPressed,
              ]}
            >
              {attendanceBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>{attendanceDone ? '출석 완료' : '출석 체크'}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 15,
    color: '#6B7280',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bannerWrap: {
    width: SCREEN_WIDTH,
    paddingBottom: BANNER_WRAP_PADDING_BOTTOM,
    marginHorizontal: -16,
    marginBottom: 16,
  },
  bannerCard: {
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  bannerImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  bannerDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerDotActive: {
    backgroundColor: 'rgba(255,255,255,1)',
  },
  bannerDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  topCard: {
    flexDirection: 'row',
    backgroundColor: MAIN,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    marginBottom: 24,
    alignItems: 'stretch',
  },
  topCardCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  topCardDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginVertical: 4,
  },
  topCardLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  topCardValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(108, 71, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
  },
  shopDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: MAIN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnPressed: {
    opacity: 0.88,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: MAIN,
  },
  primaryBtn: {
    backgroundColor: MAIN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnSpacing: {
    marginTop: 12,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  btnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
