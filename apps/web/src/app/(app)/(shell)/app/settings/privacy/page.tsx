import { SectionScreen } from '../_settings/section-screen';
import { ShortcutsSetting } from '../_settings/shortcuts-setting';

export default function PrivacySettingsPage() {
  return (
    <SectionScreen section="privacy">
      <ShortcutsSetting />
    </SectionScreen>
  );
}
