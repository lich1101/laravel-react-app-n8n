import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component to automatically update page title based on current route
 * Place this inside Router to track route changes
 */
function TitleUpdater() {
    const location = useLocation();
    
    useEffect(() => {
        const path = location.pathname;
        
        // Map routes to titles
        const titleMap = {
            // Administrator routes
            '/administrator': 'Projects - Chatplus',
            '/administrator/projects': 'Projects - Chatplus',
            '/administrator/subscription-packages': 'Subscription Packages - Chatplus',
            '/administrator/subscription-renewals': 'Subscription Renewals - Chatplus',
            '/administrator/payment-order-emails': 'Payment Order Emails - Chatplus',
            '/administrator/email-recipients': 'Email Recipients - Chatplus',
            '/administrator/automations': 'Automations - Chatplus',
            '/administrator/users': 'Users - Chatplus',
            '/administrator/settings': 'Settings - Chatplus',
            '/administrator/workflows': 'Workflows - Chatplus',
            '/administrator/folders': 'Folders - Chatplus',
            
            // Admin routes
            '/admin': 'Automations - Chatplus',
            '/admin/automations': 'Automations - Chatplus',
            '/admin/workflows': 'Workflows - Chatplus',
            '/admin/folders': 'Folders - Chatplus',
            '/admin/users': 'Users - Chatplus',
            
            // User dashboard routes
            '/dashboard': 'Dashboard - Chatplus',
            '/dashboard/workflows': 'Workflows - Chatplus',
            '/dashboard/workflows/manage': 'My Workflows - Chatplus',
            '/dashboard/credentials': 'Credentials - Chatplus',
            '/dashboard/settings': 'Settings - Chatplus',
            
            // Auth routes
            '/login': 'Đăng nhập - Chatplus',
            '/register': 'Đăng ký - Chatplus',
            '/reset-password': 'Đặt lại mật khẩu - Chatplus',
        };
        
        // Check for exact match first
        if (titleMap[path]) {
            document.title = titleMap[path];
            return;
        }
        
        // Check for workflow editor routes (with ID)
        if (path.match(/\/workflows\/\d+/)) {
            // Title will be set by WorkflowEditor component based on workflow name
            return;
        }
        
        // Check for automation table detail routes
        if (path.match(/\/automations\/table\/\d+/)) {
            document.title = 'Automation Table - Chatplus';
            return;
        }
        
        // Fallback to generic titles based on path segments
        if (path.includes('/workflows')) {
            document.title = 'Workflows - Chatplus';
        } else if (path.includes('/automations')) {
            document.title = 'Automations - Chatplus';
        } else if (path.includes('/users')) {
            document.title = 'Users - Chatplus';
        } else if (path.includes('/settings')) {
            document.title = 'Settings - Chatplus';
        } else if (path.includes('/folders')) {
            document.title = 'Folders - Chatplus';
        } else if (path.includes('/credentials')) {
            document.title = 'Credentials - Chatplus';
        } else {
            document.title = 'Chatplus';
        }
    }, [location.pathname]);
    
    return null; // This component doesn't render anything
}

export default TitleUpdater;

