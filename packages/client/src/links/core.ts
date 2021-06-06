import { observable } from '../observable';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
export type ResultEnvelope<TOutput = unknown> =
  | {
      ok: true;
      data: TOutput;
    }
  | {
      ok: false;
      error: Error;
    };

export type PrevCallback = (result: ResultEnvelope) => void;
export type ContextLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type AppLink = () => ContextLink;

export function createChain(links: ContextLink[]) {
  return {
    call(_op: Operation) {
      const $result = observable<ResultEnvelope | null>(null);
      const $aborted = observable(false);

      function walk({
        index,
        op,
        stack,
      }: {
        index: number;
        op: Operation;
        stack: PrevCallback[];
      }) {
        const link = links[index];
        const prev: PrevCallback =
          index === 0
            ? (value: ResultEnvelope) => $result.set(value)
            : stack[index - 1];

        link({
          op,
          prev,
          next: (op, prevOp) => {
            const prevStack = stack.slice();
            prevStack[index] = prevOp;
            walk({ index: index + 1, op, stack: prevStack });
          },
          onDestroy: (callback) => {
            const unsub = $aborted.subscribe({
              onNext(aborted) {
                if (aborted) {
                  callback();
                  unsub();
                }
              },
            });
          },
        });
      }
      walk({ index: 0, op: _op, stack: [] });
      return {
        get: $result.get,
        subscribe: (callback: (value: ResultEnvelope) => void) => {
          return $result.subscribe({
            onNext: (v) => {
              if (v) {
                callback(v);
              }
            },
          });
        },
        abort: () => {
          $aborted.set(true);
        },
      };
    },
  };
}