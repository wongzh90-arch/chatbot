import React from 'react';
const { createElement } = React;

export function Sidebar({ settings, setSettings, workspace, provider, runState, isRunning, windowWidth }) {
    if (!settings.sidebarOpen) return null;

    const isMobile = windowWidth < 768;
    const width = isMobile ? '100%' : 260;
    const isDark = settings.theme === 'dark';

    const panelStyle = {
        width,
        height: '100%',
        background
