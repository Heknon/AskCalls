import { SetupWizard } from './_wizard/wizard';

export const dynamic = 'force-dynamic';

/** W1: the first-run wizard. Middleware serves it only while the instance needs setup. */
export default function SetupPage() {
  return <SetupWizard />;
}
