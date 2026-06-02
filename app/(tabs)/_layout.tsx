// Tabs is the component that creates the bottom tab bar and manages switching between tab screens.
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

// This is a small helper component that renders the label shown under each tab icon.
// "focused" is true when this tab is the currently active one.
// We use it to colour the active tab orange and inactive tabs grey.
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{
      fontFamily: 'PressStart2P_400Regular',
      fontSize: 7,
      color: focused ? '#FF4D00' : '#8C857B', // Orange when active, grey when inactive.
      marginTop: 4,
    }}>
      {label}
    </Text>
  );
}

// TabsLayout defines the bottom tab bar and registers all five tab screens.
// Expo Router automatically maps each Tabs.Screen name to a file in the (tabs) folder.
// For example, name="index" maps to app/(tabs)/index.tsx (the TODAY screen).
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // Hide the default title bar at the top of each screen — we build our own headers.
        headerShown: false,

        // Styling for the bottom tab bar itself.
        tabBarStyle: {
          backgroundColor: '#FCFBF9',
          borderTopColor: '#E5E1DA', // A thin line separating the tab bar from the screen content.
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },

        // The colour of the active tab's icon and label.
        tabBarActiveTintColor: '#FF4D00',

        // The colour of all inactive tabs.
        tabBarInactiveTintColor: '#8C857B',

        // Font styling for the tab labels (used by the default label renderer).
        tabBarLabelStyle: {
          fontFamily: 'PressStart2P_400Regular',
          fontSize: 7,
        },
      }}
    >
      {/* Each Tabs.Screen registers one tab. The "name" must match the filename in (tabs)/. */}
      <Tabs.Screen name="index"    options={{ title: 'TODAY'    }} />
      <Tabs.Screen name="gym"      options={{ title: 'GYM'      }} />
      <Tabs.Screen name="tree"     options={{ title: 'TREE'     }} />
      <Tabs.Screen name="progress" options={{ title: 'PROGRESS' }} />
      <Tabs.Screen name="profile"  options={{ title: 'PROFILE'  }} />
    </Tabs>
  );
}
