import { getTranslations } from 'next-intl/server';

/** "Where plaintext does go": the three routes as a ruled table (`DataFlowNote` in prose). */
export async function PlaintextRoutes() {
  const t = await getTranslations('marketing.home.privacy');
  return (
    <table className="tbl" data-component="DataFlowNote">
      <thead>
        <tr>
          <th scope="col">{t('route')}</th>
          <th scope="col">{t('leaves')}</th>
          <th scope="col">{t('receives')}</th>
        </tr>
      </thead>
      <tbody>
        {(['transcription', 'ask', 'translation', 'inbox'] as const).map((k) => (
          <tr key={k}>
            <td>{t(`${k}.name`)}</td>
            <td>{t(`${k}.what`)}</td>
            <td>{t(`${k}.who`)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
