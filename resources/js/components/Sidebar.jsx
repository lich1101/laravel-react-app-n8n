import React from 'react';

const Sidebar = ({ isCollapsed, setIsCollapsed, activeTab, setActiveTab, menuItems }) => {
    return (
        <>
            {/* Sidebar */}
            <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-gray-800 min-h-screen transition-all duration-300 flex flex-col`}>
                {/* Toggle Button */}
                <div className="p-4 flex items-center justify-between border-b border-gray-700">
                    {!isCollapsed && (
                        <h2 className="text-white font-semibold text-lg">Menu</h2>
                    )}
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    >
                        <svg
                            className={`w-6 h-6 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                        </svg>
                    </button>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 p-2">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                                activeTab === item.id
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                            title={isCollapsed ? item.label : ''}
                        >
                            <span className="text-xl">{item.icon}</span>
                            {!isCollapsed && (
                                <span className="font-medium">{item.label}</span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Footer */}
                {!isCollapsed && (
                    <div className="p-4 border-t border-gray-700">
                        <p className="text-xs text-gray-500 text-center">
                            v1.0.0
                        </p>
                    </div>
                )}
            </div>
        </>
    );
};

export default Sidebar;

