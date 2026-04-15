import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const MetisContext = createContext(null);

/**
 * MetisProvider holds cross-page state:
 * - commandPaletteOpen: bool
 * - entityDrawer: { open, entityType, entityId, data }
 * - activeTheme: 'default' | 'night_ops' | 'crt'
 * - layerToggles: { scope, discovery, live, history, findings, notes }
 * - timelineRange: { from, to }
 */
export function MetisProvider({ children }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [entityDrawer, setEntityDrawer] = useState({ open: false, entityType: null, entityId: null, data: null });
  const [activeTheme, setActiveTheme] = useState('default');
  const [layerToggles, setLayerToggles] = useState({
    scope: true, discovery: true, live: true, history: false, findings: true, notes: false,
  });
  const [timelineRange, setTimelineRange] = useState({ from: null, to: null });

  const openEntity = useCallback((entityType, entityId, data = null) => {
    setEntityDrawer({ open: true, entityType, entityId, data });
  }, []);

  const closeEntity = useCallback(() => {
    setEntityDrawer(prev => ({ ...prev, open: false }));
  }, []);

  const toggleLayer = useCallback((layer) => {
    setLayerToggles(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const switchTheme = useCallback((theme) => {
    setActiveTheme(theme);
    document.documentElement.setAttribute('data-metis-theme', theme);
  }, []);

  return (
    <MetisContext.Provider value={{
      commandPaletteOpen, setCommandPaletteOpen,
      entityDrawer, openEntity, closeEntity,
      activeTheme, switchTheme,
      layerToggles, toggleLayer,
      timelineRange, setTimelineRange,
    }}>
      {children}
    </MetisContext.Provider>
  );
}

export function useMetis() {
  const ctx = useContext(MetisContext);
  if (!ctx) throw new Error('useMetis must be used inside MetisProvider');
  return ctx;
}
