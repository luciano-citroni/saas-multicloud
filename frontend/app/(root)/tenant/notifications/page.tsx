import { NotificationEmailsSettings } from '@/components/root/notifications/notification-emails-settings';

export default function TenantNotificationsPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <NotificationEmailsSettings />
        </div>
    );
}
