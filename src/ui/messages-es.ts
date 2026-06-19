/**
 * Spanish UI strings. The English text is the key; anything missing here
 * falls back to English automatically. Expanded command-by-command.
 */
export const MESSAGES_ES: Record<string, string> = {
  'This command is interactive and requires a terminal.':
    'Este comando es interactivo y necesita una terminal.',
  'Run it directly in your terminal, not from a script or CI.':
    'Ejecutalo directo en tu terminal, no desde un script o CI.',
  'Cancelled.': 'Cancelado.',
  'What do you want to do?': '¿Qué querés hacer?',
  'exit': 'salir',
  'Bye!': '¡Chau!',

  // whoami
  'Checking your AWS identity…': 'Verificando tu identidad de AWS…',
  'Account': 'Cuenta',
  'Identity': 'Identidad',
  'User ID': 'User ID',
  'Profile': 'Perfil',
  'Region': 'Región',
  'Could not resolve credentials for profile "{profile}".':
    'No se pudieron resolver las credenciales del perfil "{profile}".',
  'Check the profile exists and its keys are valid (awswiz doctor coming soon).':
    'Revisá que el perfil exista y sus claves sean válidas (awswiz doctor pronto).',

  // mfa
  'Which profile do you want an MFA session for?': '¿Para qué perfil querés una sesión MFA?',
  'No profiles with long-lived keys found to MFA-protect.':
    'No hay perfiles con claves de larga duración para proteger con MFA.',
  'Add one with "awswiz profile add".': 'Agregá uno con "awswiz profile add".',
  'Profile "{profile}" not found.': 'No se encontró el perfil "{profile}".',
  'Discovering your MFA device…': 'Descubriendo tu dispositivo MFA…',
  'MFA device': 'Dispositivo MFA',
  'You have several MFA devices — which one?': 'Tenés varios dispositivos MFA — ¿cuál?',
  'You have several MFA devices.': 'Tenés varios dispositivos MFA.',
  'Pass --serial <arn> to choose one.': 'Pasá --serial <arn> para elegir uno.',
  'No MFA serial for "{profile}".': 'No hay serial de MFA para "{profile}".',
  'Pass --serial arn:aws:iam::…:mfa/you, or add mfa_serial to the profile.':
    'Pasá --serial arn:aws:iam::…:mfa/vos, o agregá mfa_serial al perfil.',
  'Your MFA device ARN (mfa_serial):': 'El ARN de tu dispositivo MFA (mfa_serial):',
  'Should look like arn:aws:iam::<account>:mfa/<name>':
    'Debería verse como arn:aws:iam::<cuenta>:mfa/<nombre>',
  'Save this MFA serial to the {profile} profile for next time?':
    '¿Guardar este serial de MFA en el perfil {profile} para la próxima?',
  'Enter the 6-digit code from your MFA app:': 'Ingresá el código de 6 dígitos de tu app de MFA:',
  'The code is 6 digits.': 'El código es de 6 dígitos.',
  'Requesting a temporary session from AWS…': 'Pidiendo una sesión temporal a AWS…',
  'Expires': 'Vence',
  'in': 'en',
  'MFA session ready': 'Sesión MFA lista',

  // profiles
  'No AWS profiles found.': 'No se encontraron perfiles de AWS.',
  'Create one with "awswiz profile add" (coming soon), or run "aws configure".':
    'Creá uno con "awswiz profile add" (pronto), o corré "aws configure".',
  '{n} profile(s) in ~/.aws:': '{n} perfil(es) en ~/.aws:',
};
