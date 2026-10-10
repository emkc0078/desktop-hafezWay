import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  LocalConfigsArchive,
  ListLocalConfigsArchivesResult,
} from '@/electron-bridge';
import { useT } from '@/context/LocaleContext';
import { Btn, Card, Field, Input, Modal, Select, TableShell, tableHeadClass } from '@/components/ui';

type Only = 'all' | 'env' | 'nginx';

type Picked = {
  path: string;
  fileName: string;
  sizeMB?: string;
};

type RunOutput = {
  ok: boolean;
  step?: 'scp' | 'ssh' | 'done';
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
};

const DEFAULT_SERVER = 'root@109.235.65.211';

type Props = {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void;
};

export function RestoreBackupPanel({ onMessage }: Props) {
  const t = useT();
  const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;

  const [server, setServer] = useState(DEFAULT_SERVER);
  const [only, setOnly] = useState<Only>('all');
  const [dryRun, setDryRun] = useState(true);
  const [noReload, setNoReload] = useState(false);
  const [envOwner, setEnvOwner] = useState('');

  const [picked, setPicked] = useState<Picked | null>(null);
  const [list, setList] = useState<ListLocalConfigsArchivesResult>({ dirs: [], archives: [] });
  const [listLoading, setListLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<RunOutput | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!bridge?.listLocalConfigsArchives) return;
    setListLoading(true);
    try {
      const res = await bridge.listLocalConfigsArchives();
      setList(res);
    } catch (e) {
      onMessage(t('restore.listFailed', { message: (e as Error).message }), 'error');
    } finally {
      setListLoading(false);
    }
  }, [bridge, onMessage, t]);

  useEffect(() => {
    // Initial fetch when the panel mounts; matches the pattern used elsewhere
    // in the dashboard for tab-scoped data loads.
    void refresh();
  }, [refresh]);

  const selectFromList = useCallback((row: LocalConfigsArchive) => {
    setPicked({ path: row.path, fileName: row.fileName, sizeMB: row.sizeMB });
    setOutput(null);
  }, []);

  const pickFile = useCallback(async () => {
    if (!bridge?.pickConfigsArchive) {
      onMessage(t('restore.pickerUnavailable'), 'error');
      return;
    }
    try {
      const res = await bridge.pickConfigsArchive();
      if (!res.ok) return;
      setPicked({ path: res.path, fileName: res.fileName, sizeMB: res.sizeMB });
      setOutput(null);
    } catch (e) {
      onMessage(t('restore.pickFailed', { message: (e as Error).message }), 'error');
    }
  }, [bridge, onMessage, t]);

  const summaryLabel = useMemo(() => {
    if (only === 'all') return t('restore.scopeAll');
    if (only === 'env') return t('restore.scopeEnv');
    return t('restore.scopeNginx');
  }, [only, t]);

  const beginRestore = useCallback(() => {
    if (!picked) {
      onMessage(t('restore.pickArchiveFirst'), 'error');
      return;
    }
    setConfirmOpen(true);
  }, [picked, onMessage, t]);

  const runRestore = useCallback(async () => {
    if (!bridge?.runRestoreOnServer || !picked) return;
    setConfirmOpen(false);
    setRunning(true);
    setOutput(null);
    try {
      const res = await bridge.runRestoreOnServer({
        archivePath: picked.path,
        server: server.trim(),
        only,
        dryRun,
        noReload,
        envOwner: envOwner.trim() || undefined,
      });
      setOutput(res);
      if (res.ok) {
        onMessage(dryRun ? t('restore.dryRunComplete') : t('restore.restoreComplete'), 'success');
      } else {
        onMessage(
          t('restore.restoreFailed', {
            step: res.step ? t('restore.atStep', { step: res.step }) : '',
            message: res.error || t('common.unknown'),
          }),
          'error',
        );
      }
    } catch (e) {
      onMessage(t('restore.restoreError', { message: (e as Error).message }), 'error');
    } finally {
      setRunning(false);
    }
  }, [bridge, picked, server, only, dryRun, noReload, envOwner, onMessage, t]);

  if (!bridge) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('restore.title')}</h2>
        <p className="text-sm text-text-muted">{t('restore.electronOnly')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('restore.restoreTitle')}</h2>
            <p className="text-sm text-text-muted">{t('restore.restoreHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={pickFile} disabled={running}>
              {t('restore.chooseFile')}
            </Btn>
            <Btn variant="info" onClick={() => void refresh()} disabled={running || listLoading}>
              {t('restore.refreshList')}
            </Btn>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('restore.server')}>
            <Input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="root@109.235.65.211"
              disabled={running}
            />
          </Field>
          <Field label={t('restore.whatToRestore')}>
            <Select
              value={only}
              onChange={(e) => setOnly(e.target.value as Only)}
              disabled={running}
            >
              <option value="all">{t('restore.all')}</option>
              <option value="env">{t('restore.envOnly')}</option>
              <option value="nginx">{t('restore.nginxOnly')}</option>
            </Select>
          </Field>
          <Field label={t('restore.envOwner')}>
            <Input
              value={envOwner}
              onChange={(e) => setEnvOwner(e.target.value)}
              placeholder="root"
              disabled={running}
            />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={running}
              />
              <span>
                {t('restore.dryRun')} <span className="text-text-muted">{t('restore.dryRunHint')}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={noReload}
                onChange={(e) => setNoReload(e.target.checked)}
                disabled={running}
              />
              <span>
                {t('restore.skipNginxReload')}
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          {picked ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{picked.fileName}</div>
                <div className="font-mono text-xs text-text-muted">{picked.path}</div>
                {picked.sizeMB ? (
                  <div className="text-xs text-text-muted">{picked.sizeMB} MB</div>
                ) : null}
              </div>
              <Btn
                variant="secondary"
                className="!px-2 !py-1 text-xs"
                onClick={() => setPicked(null)}
                disabled={running}
              >
                {t('restore.clear')}
              </Btn>
            </div>
          ) : (
            <p className="text-text-muted">{t('restore.noArchive')}</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {t('restore.willRestore', { scope: summaryLabel, server: server || '(no server)' })}
            {dryRun ? t('restore.dryRunSuffix') : '.'}
          </p>
          <Btn
            variant={dryRun ? 'info' : 'danger'}
            onClick={beginRestore}
            disabled={running || !picked}
          >
            {running
              ? t('common.working')
              : dryRun
                ? t('restore.runDryRun')
                : t('restore.restoreOnServer')}
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{t('restore.localArchives')}</h3>
          {list.dirs.length > 0 ? (
            <div className="text-xs text-text-muted">
              {t('restore.searched')}{' '}
              {list.dirs.map((d) => <code key={d}>{d}</code>).reduce<React.ReactNode[]>(
                (acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]),
                [],
              )}
            </div>
          ) : (
            <div className="text-xs text-text-muted">{t('restore.noFolders')}</div>
          )}
        </div>
        {listLoading ? (
          <p className="text-text-muted">{t('common.loading')}</p>
        ) : list.archives.length === 0 ? (
          <p className="text-text-muted">{t('restore.noArchives')}</p>
        ) : (
          <TableShell>
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {[
                  t('restore.cols.file'),
                  t('restore.cols.folder'),
                  t('restore.cols.sizeMB'),
                  t('restore.cols.modified'),
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className={tableHeadClass}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {list.archives.map((row) => {
                const isSelected = picked?.path === row.path;
                return (
                  <tr
                    key={row.path}
                    className={
                      isSelected
                        ? 'bg-brand-primary/10 dark:bg-brand-primary/20'
                        : 'dark:bg-gray-800/50'
                    }
                  >
                    <td className="px-3 py-2 font-medium">{row.fileName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">{row.dir}</td>
                    <td className="px-3 py-2 text-sm">{row.sizeMB}</td>
                    <td className="px-3 py-2 text-xs">{row.mtime}</td>
                    <td className="px-3 py-2">
                      <Btn
                        variant={isSelected ? 'success' : 'primary'}
                        className="!px-2 !py-1 text-xs"
                        onClick={() => selectFromList(row)}
                        disabled={running}
                      >
                        {isSelected ? t('common.selected') : t('common.select')}
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      {output ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">
              {output.ok ? t('restore.outputTitle') : t('restore.outputFailed')}
            </h3>
            <div className="text-xs text-text-muted">
              {output.step ? `step=${output.step}` : ''}{' '}
              {typeof output.exitCode === 'number' ? `exit=${output.exitCode}` : ''}
            </div>
          </div>
          {output.error ? (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100">
              {output.error}
            </div>
          ) : null}
          {output.stdout ? (
            <details open className="mb-2 rounded-lg border border-gray-200 dark:border-gray-700">
              <summary className="cursor-pointer bg-gray-50 px-3 py-2 text-sm font-medium dark:bg-gray-900">
                stdout
              </summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 text-xs">
                {output.stdout}
              </pre>
            </details>
          ) : null}
          {output.stderr ? (
            <details open className="rounded-lg border border-gray-200 dark:border-gray-700">
              <summary className="cursor-pointer bg-gray-50 px-3 py-2 text-sm font-medium dark:bg-gray-900">
                stderr
              </summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 text-xs">
                {output.stderr}
              </pre>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={dryRun ? t('restore.confirmDryRun') : t('restore.confirmRestore')}
      >
        <div className="space-y-3 text-sm">
          {!dryRun ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {t('restore.overwriteWarning', { server })}
            </div>
          ) : (
            <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100">
              {t('restore.dryRunInfo')}
            </div>
          )}
          <ul className="list-inside list-disc space-y-1">
            <li>
              {t('restore.serverLabel')} <code>{server}</code>
            </li>
            <li>
              {t('restore.archiveLabel')} <code>{picked?.fileName ?? '(none)'}</code>
            </li>
            <li>
              {t('restore.scopeLabel')} {summaryLabel}
            </li>
            {noReload ? <li>{t('restore.skipReload')}</li> : null}
            {envOwner ? (
              <li>
                {t('restore.envOwnerLabel')} <code>{envOwner}</code>
              </li>
            ) : null}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant={dryRun ? 'info' : 'danger'} onClick={() => void runRestore()}>
              {dryRun ? t('restore.runDryRunBtn') : t('restore.restoreNow')}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
