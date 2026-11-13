import { LegalPage } from '../_components/legal';
import { meta } from '../_components/meta';

export const generateMetadata = meta('terms', '/terms');

export default function Page() {
  return <LegalPage doc="terms" path="/terms" />;
}
