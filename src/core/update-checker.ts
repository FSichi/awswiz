import updateNotifier from 'update-notifier';

export function checkForUpdates(pkg: { name: string; version: string }): void {
  const notifier = updateNotifier({ pkg });
  notifier.notify({ isGlobal: true });
}
