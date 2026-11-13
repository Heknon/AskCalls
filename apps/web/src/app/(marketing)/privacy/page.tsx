import { LegalPage } from '../_components/legal';
import { meta } from '../_components/meta';

export const generateMetadata = meta('privacy', '/privacy');

export default function Page() {
  return <LegalPage doc="privacy" path="/privacy" />;
}
