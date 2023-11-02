import { createEffect } from "solid-js";

export default function ConfirmDialog(props: {
  title: string;
  message: string;
  action: string;
  isActionDestructive: boolean;
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  let ref: HTMLDialogElement;

  createEffect(() => {
    if (props.opened) {
      ref.showModal();
    } else {
      ref.close();
    }
  });

  return (
    <dialog
      ref={ref}
      class="p-3 bg-surface text-white rounded absolute top-20 backdrop-opacity-80"
    >
      <h1 class="mb-2">{props.title}</h1>
      <p class="mb-2">{props.message}</p>
      <div class="flex flex-row justify-end">
        <button
          onClick={() => props.onClose()}
          type="button"
          class="btn-secondary mr-2"
        >
          Annuler
        </button>
        <button
          onClick={() => props.onConfirm()}
          type="button"
          class="btn-danger"
        >
          {props.action}
        </button>
      </div>
    </dialog>
  );
}
