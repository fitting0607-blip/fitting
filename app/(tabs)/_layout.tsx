import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';

const ACTIVE = '#3B3BF9';
const INACTIVE = '#9CA3AF';
const TAB_BG = '#FFFFFF';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: { backgroundColor: TAB_BG },
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: '지도',
          tabBarIcon: ({ color, size }) => (
            <Feather name="map-pin" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: '채팅',
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-circle" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reward"
        options={{
          title: '리워드',
          tabBarIcon: ({ color, size }) => (
            <Feather name="gift" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: '마이',
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size ?? 24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
