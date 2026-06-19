declare module 'update-notifier' {
  interface Options {
    pkg: { name: string; version: string };
    updateCheckInterval?: number;
    shouldNotifyInNpmScript?: boolean;
  }

  interface UpdateInfo {
    latest: string;
    current: string;
    type: string;
    name: string;
  }

  interface Notifier {
    update?: UpdateInfo;
    notify(options?: { isGlobal?: boolean; message?: string }): Notifier;
  }

  export default function updateNotifier(options: Options): Notifier;
}
