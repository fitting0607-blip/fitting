import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Dimensions, Image, StyleSheet, View } from 'react-native';

const SPLASH_DURATION_MS = 1750;
const LOGO_ASPECT_RATIO = 200 / 75;

type SplashScreenProps = {
  onFinish?: () => void;
};

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const router = useRouter();
  const logoWidth = Dimensions.get('window').width * 0.9;

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/login');
      onFinish?.();
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [router, onFinish]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/logo.png')}
        style={[styles.logoImage, { width: logoWidth, aspectRatio: LOGO_ASPECT_RATIO }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    height: undefined,
  },
});
