import { Redirect } from 'expo-router';

// Entry point — will redirect to auth or main app once we add auth logic
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
