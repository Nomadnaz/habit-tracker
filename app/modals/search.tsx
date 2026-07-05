import { useRouter } from 'expo-router';
import GlobalSearch from '@/components/GlobalSearch';

export default function SearchModal() {
  const router = useRouter();
  return <GlobalSearch onClose={() => router.back()} />;
}
