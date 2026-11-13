import { LegalPage } from '../_components/legal';
import { meta } from '../_components/meta';

export const generateMetadata = meta('dpa', '/dpa');

export default function Page() {
  return <LegalPage doc="dpa" path="/dpa" />;
}
