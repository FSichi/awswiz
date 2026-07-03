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

  // update
  'Update awswiz to the latest version': 'Actualizar awswiz a la última versión',
  'use npm as package manager': 'usar npm como gestor de paquetes',
  'use yarn as package manager': 'usar yarn como gestor de paquetes',
  'use pnpm as package manager': 'usar pnpm como gestor de paquetes',
  'use bun as package manager': 'usar bun como gestor de paquetes',
  'Detected package manager: {pm}': 'Gestor de paquetes detectado: {pm}',
  'Checking for updates…': 'Buscando actualizaciones…',
  'Updating @fsichi/awswiz via {pm}…': 'Actualizando @fsichi/awswiz con {pm}…',
  '@fsichi/awswiz updated successfully! 🎉': '¡@fsichi/awswiz actualizado con éxito! 🎉',
  'Run "awswiz --version" to verify.': 'Corré "awswiz --version" para verificar.',
  'Update failed.': 'La actualización falló.',
  'Try running the command manually: {cmd}': 'Probá correr el comando a mano: {cmd}',
  '— update to latest version': '— actualizar a la última versión',

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

  'Role': 'Rol',

  // profiles
  'No AWS profiles found.': 'No se encontraron perfiles de AWS.',
  'Create one with "awswiz profile add", or run "aws configure".':
    'Creá uno con "awswiz profile add", o corré "aws configure".',
  '{n} profile(s) in ~/.aws:': '{n} perfil(es) en ~/.aws:',
  'Name cannot be empty.': 'El nombre no puede estar vacío.',
  'Use letters, numbers, dots, dashes and underscores.':
    'Usá letras, números, puntos, guiones y guiones bajos.',
  'Profile name:': 'Nombre del perfil:',
  'Profile "{profile}" already exists. Overwrite its settings?':
    'El perfil "{profile}" ya existe. ¿Sobrescribir su configuración?',
  'How does this profile authenticate?': '¿Cómo se autentica este perfil?',
  'AWS access key ID:': 'AWS access key ID:',
  'That does not look like an access key ID.': 'Eso no parece un access key ID.',
  'AWS secret access key:': 'AWS secret access key:',
  'That does not look like a secret access key.': 'Eso no parece un secret access key.',
  'Default region:': 'Región por defecto:',
  'SSO start URL:': 'URL de inicio de SSO:',
  'Enter the full https start URL.': 'Ingresá la URL https completa de inicio.',
  'SSO region:': 'Región de SSO:',
  'AWS account ID:': 'ID de cuenta de AWS:',
  'Account IDs are 12 digits.': 'Los IDs de cuenta son de 12 dígitos.',
  'SSO role name (permission set):': 'Nombre del rol SSO (permission set):',
  'Profile "{profile}" saved.': 'Perfil "{profile}" guardado.',
  'No profiles to edit.': 'No hay perfiles para editar.',
  'Which profile do you want to edit?': '¿Qué perfil querés editar?',
  'What do you want to change?': '¿Qué querés cambiar?',
  'Access keys': 'Access keys',
  'MFA device ARN': 'ARN del dispositivo MFA',
  'New region:': 'Nueva región:',
  'New access key ID:': 'Nuevo access key ID:',
  'New secret access key:': 'Nuevo secret access key:',
  'MFA device ARN:': 'ARN del dispositivo MFA:',
  'Profile "{profile}" updated.': 'Perfil "{profile}" actualizado.',
  'No profiles to remove.': 'No hay perfiles para borrar.',
  'Which profile do you want to remove?': '¿Qué perfil querés borrar?',
  'Remove "{profile}" from ~/.aws? This cannot be undone.':
    '¿Borrar "{profile}" de ~/.aws? Esto no se puede deshacer.',
  'Profile "{profile}" removed.': 'Perfil "{profile}" borrado.',
  'Profile "{profile}" was not found.': 'No se encontró el perfil "{profile}".',
  'Profiles — what do you want to do?': 'Perfiles — ¿qué querés hacer?',
  'List profiles': 'Listar perfiles',
  'Add a profile': 'Agregar un perfil',
  'Edit a profile': 'Editar un perfil',
  'Remove a profile': 'Borrar un perfil',

  // assume
  'Which profile should assume the role (the source)?':
    '¿Qué perfil debería asumir el rol (el origen)?',
  'No role ARN given.': 'No se indicó un ARN de rol.',
  'Pass --role arn:aws:iam::…:role/Name.': 'Pasá --role arn:aws:iam::…:role/Nombre.',
  'Role ARN to assume:': 'ARN del rol a asumir:',
  'Should look like arn:aws:iam::<account>:role/<name>':
    'Debería verse como arn:aws:iam::<cuenta>:role/<nombre>',
  'This source requires MFA.': 'Este origen requiere MFA.',
  'Pass --code <6 digits>.': 'Pasá --code <6 dígitos>.',
  'MFA code (this role needs MFA):': 'Código MFA (este rol necesita MFA):',
  'Assuming the role…': 'Asumiendo el rol…',
  'Save the temporary credentials as which profile?':
    '¿Con qué nombre de perfil guardo las credenciales temporales?',
  'Role assumed': 'Rol asumido',

  // login (SSO)
  'Profile "{profile}" has no sso_start_url.': 'El perfil "{profile}" no tiene sso_start_url.',
  'Add it with "awswiz profile add" (SSO), or pass --start-url.':
    'Agregalo con "awswiz profile add" (SSO), o pasá --start-url.',
  'The sso-session "{session}" was not found in ~/.aws/config.':
    'No se encontró la sso-session "{session}" en ~/.aws/config.',
  'The sso-session "{session}" has no sso_start_url.':
    'La sso-session "{session}" no tiene sso_start_url.',
  'Profile "{profile}" is not an SSO profile.': 'El perfil "{profile}" no es un perfil SSO.',
  'It has no sso_session or sso_start_url. Add one with "awswiz profile add" (SSO).':
    'No tiene sso_session ni sso_start_url. Agregá uno con "awswiz profile add" (SSO).',
  'Which SSO profile do you want to sign in with?': '¿Con qué perfil SSO querés iniciar sesión?',
  'Verifying that the session actually works…': 'Verificando que la sesión realmente funcione…',
  'Verified — {profile} is ready (account {account}).':
    'Verificado — {profile} está listo (cuenta {account}).',
  'Signed in, but "{profile}" still could not resolve credentials.':
    'Sesión iniciada, pero "{profile}" todavía no puede resolver credenciales.',
  'Check sso_account_id / sso_role_name in the profile.':
    'Revisá sso_account_id / sso_role_name en el perfil.',
  'Approve this sign-in in your browser:': 'Aprobá este inicio de sesión en tu navegador:',
  'Verification code': 'Código de verificación',
  'Waiting for you to approve…': 'Esperando que apruebes…',
  'Signed in. Token valid until {time}.': 'Sesión iniciada. Token válido hasta {time}.',
  'SSO login failed': 'El inicio de sesión SSO falló',
  'SSO login timed out — the code expired before it was approved.':
    'El inicio de sesión SSO expiró — el código venció antes de aprobarse.',

  // use
  'Which profile do you want to use?': '¿Qué perfil querés usar?',
  'Copied "{profile}" into the default profile — "aws" uses it everywhere now.':
    'Copié "{profile}" al perfil default — ahora "aws" lo usa en todos lados.',
  "A tool can't change your shell's environment for you, so run this:":
    'Una herramienta no puede cambiar el entorno de tu shell, así que corré esto:',
  '(PowerShell — for cmd.exe use: set AWS_PROFILE={profile})':
    '(PowerShell — para cmd.exe usá: set AWS_PROFILE={profile})',
  '(cmd.exe — for PowerShell use: $env:AWS_PROFILE="{profile}")':
    '(cmd.exe — para PowerShell usá: $env:AWS_PROFILE="{profile}")',
  '(fish shell)': '(shell fish)',
  '(bash / zsh)': '(bash / zsh)',
  'Or make it the default (no env var needed): awswiz use {profile} --default':
    'O hacelo el default (sin variable de entorno): awswiz use {profile} --default',

  // region
  'Which profile?': '¿Qué perfil?',
  'Region for {profile}:': 'Región para {profile}:',
  'Looks off — regions are like us-east-1, eu-west-2.':
    'Se ve raro — las regiones son tipo us-east-1, eu-west-2.',
  '{profile} region set to {region}.': 'La región de {profile} quedó en {region}.',

  // doctor
  '~/.aws/config exists': '~/.aws/config existe',
  '~/.aws/credentials exists': '~/.aws/credentials existe',
  '{n} profile(s) configured': '{n} perfil(es) configurado(s)',
  'Checking your clock against AWS…': 'Comparando tu reloj con AWS…',
  'Could not reach AWS to check the clock (offline?).':
    'No se pudo contactar a AWS para chequear el reloj (¿sin conexión?).',
  'Clock is in sync with AWS (±{n}s)': 'El reloj está en sync con AWS (±{n}s)',
  'Your clock is off by {n}s — this breaks MFA. Sync your system time.':
    'Tu reloj está desfasado {n}s — esto rompe el MFA. Sincronizá la hora del sistema.',

  // STS errors
  'AWS returned an incomplete set of credentials.':
    'AWS devolvió un set de credenciales incompleto.',
  'AWS denied the request.': 'AWS denegó la solicitud.',
  'Your user may lack permission, or the MFA code/serial is wrong.':
    'Puede que tu usuario no tenga permiso, o que el código/serial de MFA esté mal.',
  "The profile's access keys are invalid.": 'Las claves de acceso del perfil son inválidas.',
  'Check aws_access_key_id / aws_secret_access_key for this profile.':
    'Revisá aws_access_key_id / aws_secret_access_key de este perfil.',
  'AWS rejected one of the values.': 'AWS rechazó uno de los valores.',
  'The MFA code must be the current 6 digits; the role ARN must be valid.':
    'El código MFA tiene que ser los 6 dígitos actuales; el ARN del rol tiene que ser válido.',
  'The base credentials have expired.': 'Las credenciales base vencieron.',
  'Refresh them (re-run mfa/login) and try again.':
    'Renovalas (volvé a correr mfa/login) y probá de nuevo.',
  'AWS request failed': 'La solicitud a AWS falló',

  // menu descriptions
  '— which account / role / profile am I?': '— ¿qué cuenta / rol / perfil estoy usando?',
  '— start an MFA session': '— iniciar una sesión MFA',
  '— assume a role (cross-account)': '— asumir un rol (entre cuentas)',
  '— sign in to SSO': '— iniciar sesión en SSO',
  '— switch the active profile': '— cambiar el perfil activo',
  '— add / edit / remove / list': '— agregar / editar / borrar / listar',
  '— set a profile region': '— setear la región de un perfil',
  '— check your AWS setup': '— chequear tu configuración de AWS',

  // status
  'Show which sessions are alive and when they expire':
    'Mostrar qué sesiones están vivas y cuándo vencen',
  'Temporary sessions:': 'Sesiones temporales:',
  'none — start one with "awswiz mfa" or "awswiz assume"':
    'ninguna — iniciá una con "awswiz mfa" o "awswiz assume"',
  'no expiry recorded': 'sin vencimiento registrado',
  'expires in {rel}': 'vence en {rel}',
  'expired': 'vencida',
  'SSO sessions:': 'Sesiones SSO:',
  'signed in — {rel} left': 'sesión activa — quedan {rel}',
  'not signed in': 'sin sesión',
  'Active profile': 'Perfil activo',
  '(AWS_PROFILE not set)': '(AWS_PROFILE sin setear)',
  '— sessions, expirations, active profile': '— sesiones, vencimientos, perfil activo',

  // exec
  "Run a command with a profile's credentials (sets AWS_PROFILE)":
    'Correr un comando con las credenciales de un perfil (setea AWS_PROFILE)',
  'the command to run': 'el comando a correr',
  'No command given.': 'No indicaste un comando.',
  'Example: awswiz exec -p prod -- aws s3 ls': 'Ejemplo: awswiz exec -p prod -- aws s3 ls',
  'Which profile should the command run with?': '¿Con qué perfil corre el comando?',
  'The "{profile}" session is expired — the command will likely fail.':
    'La sesión de "{profile}" está vencida — el comando probablemente falle.',
  'Renew it first: awswiz mfa -p {base}': 'Renovala primero: awswiz mfa -p {base}',
  'Could not run "{cmd}": {err}': 'No se pudo ejecutar "{cmd}": {err}',

  // console
  'Open the AWS web console signed in with a profile':
    'Abrir la consola web de AWS logueado con un perfil',
  'print the sign-in URL instead of opening the browser':
    'imprimir la URL de acceso en vez de abrir el navegador',
  'Which profile do you want to open the console with?':
    '¿Con qué perfil querés abrir la consola?',
  'Creating a console sign-in link…': 'Creando el enlace de acceso a la consola…',
  'AWS rejected the federation request (HTTP {status}).':
    'AWS rechazó la solicitud de federación (HTTP {status}).',
  'The credentials may be expired — renew the session and try again.':
    'Las credenciales pueden estar vencidas — renová la sesión y probá de nuevo.',
  'AWS did not return a sign-in token.': 'AWS no devolvió un token de acceso.',
  'Console opened in your browser — profile {profile}, region {region}.':
    'Consola abierta en tu navegador — perfil {profile}, región {region}.',
  'Console sign-in needs role/SSO credentials or long-lived keys.':
    'El acceso a la consola necesita credenciales de rol/SSO o claves de larga duración.',
  'Sessions from GetSessionToken cannot federate — use the base profile.':
    'Las sesiones de GetSessionToken no pueden federar — usá el perfil base.',
  '— open the AWS web console': '— abrir la consola web de AWS',

  // cli descriptions (shown in --help)
  'Friendly AWS credentials — wizards for profiles, MFA, assume-role and SSO':
    'Credenciales AWS amigables — asistentes para perfiles, MFA, assume-role y SSO',
  'print extra detail': 'mostrar más detalle',
  'Show the active identity: account, role and profile':
    'Mostrar la identidad activa: cuenta, rol y perfil',
  'the AWS profile to use': 'el perfil de AWS a usar',
  'Manage your AWS profiles in ~/.aws': 'Gestionar tus perfiles de AWS en ~/.aws',
  'List the profiles found in ~/.aws': 'Listar los perfiles que hay en ~/.aws',
  'Add a new profile (access keys or SSO)': 'Agregar un perfil nuevo (access keys o SSO)',
  'Edit a profile (region, keys, MFA serial)': 'Editar un perfil (región, claves, serial MFA)',
  'Remove a profile from ~/.aws': 'Borrar un perfil de ~/.aws',
  'the profile to remove': 'el perfil a borrar',
  'Start an MFA session — creates a temporary "<profile>-mfa" profile':
    'Iniciar una sesión MFA — crea un perfil temporal "<perfil>-mfa"',
  'the base profile (with long-lived keys)': 'el perfil base (con claves de larga duración)',
  'the 6-digit MFA code (enables non-interactive mode)':
    'el código MFA de 6 dígitos (activa el modo no interactivo)',
  'the MFA device ARN (mfa_serial)': 'el ARN del dispositivo MFA (mfa_serial)',
  'session duration in seconds': 'duración de la sesión en segundos',
  'Assume an IAM role and save the temporary credentials':
    'Asumir un rol de IAM y guardar las credenciales temporales',
  'the source profile': 'el perfil de origen',
  'the role ARN to assume': 'el ARN del rol a asumir',
  'the role session name': 'el nombre de sesión del rol',
  'the profile to save the credentials as': 'el perfil con el que guardar las credenciales',
  'the 6-digit MFA code (if the role needs MFA)':
    'el código MFA de 6 dígitos (si el rol necesita MFA)',
  'the MFA device ARN': 'el ARN del dispositivo MFA',
  'Sign in to IAM Identity Center (SSO)': 'Iniciar sesión en IAM Identity Center (SSO)',
  'an SSO profile to read the start URL from': 'un perfil SSO del que leer la URL de inicio',
  'the SSO start URL': 'la URL de inicio de SSO',
  'the SSO region': 'la región de SSO',
  'Switch the active profile': 'Cambiar el perfil activo',
  'the profile to use': 'el perfil a usar',
  'copy it into the default profile (no env var needed)':
    'copiarlo al perfil default (sin variable de entorno)',
  'Set the default region for a profile': 'Setear la región por defecto de un perfil',
  'the profile': 'el perfil',
  'the region, e.g. us-east-1': 'la región, ej. us-east-1',
  'Check your AWS setup (files, clock skew, profiles)':
    'Chequear tu configuración de AWS (archivos, desfase de reloj, perfiles)',
};
