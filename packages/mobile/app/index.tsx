import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { user } = useAuthStore();
  return user ? <Redirect href="/(tabs)/dashboard" /> : <Redirect href="/login" />;
}
