import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionConfirmDialog, type DialogVariant } from "./ActionConfirmDialog";
import { ActionPromptDialog } from "./ActionPromptDialog";
import { ActionFeedbackDialog, type FeedbackType } from "./ActionFeedbackDialog";

export interface ConfirmOptions {
  title: ReactNode;
  description: ReactNode;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  confirmationPhrase?: string;
  details?: ReactNode;
}

export interface PromptOptions {
  title: ReactNode;
  description?: ReactNode;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  submitText?: string;
  cancelText?: string;
  validate?: (value: string) => string | null | undefined;
}

export interface AlertOptions {
  title: ReactNode;
  message: ReactNode;
  type?: FeedbackType;
  buttonText?: string;
  details?: ReactNode;
}

interface ActionDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions) => Promise<void>;
}

const ActionDialogContext = createContext<ActionDialogContextValue | null>(null);

export function ActionDialogProvider({ children }: { children: ReactNode }) {
  // Confirmation state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions>({
    title: "",
    description: "",
  });
  const confirmResolverRef = useRef<((val: boolean) => void) | null>(null);

  // Prompt state
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptOptions, setPromptOptions] = useState<PromptOptions>({
    title: "",
    label: "",
  });
  const promptResolverRef = useRef<((val: string | null) => void) | null>(null);

  // Alert state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertOptions, setAlertOptions] = useState<AlertOptions>({
    title: "",
    message: "",
  });
  const alertResolverRef = useRef<(() => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmOptions(options);
      setConfirmOpen(true);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      promptResolverRef.current = resolve;
      setPromptOptions(options);
      setPromptOpen(true);
    });
  }, []);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      alertResolverRef.current = resolve;
      setAlertOptions(options);
      setAlertOpen(true);
    });
  }, []);

  return (
    <ActionDialogContext.Provider value={{ confirm, prompt, alert }}>
      {children}

      {/* Confirmation Window */}
      <ActionConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && confirmResolverRef.current) {
            confirmResolverRef.current(false);
            confirmResolverRef.current = null;
          }
        }}
        title={confirmOptions.title}
        description={confirmOptions.description}
        variant={confirmOptions.variant}
        confirmText={confirmOptions.confirmText}
        cancelText={confirmOptions.cancelText}
        confirmationPhrase={confirmOptions.confirmationPhrase}
        details={confirmOptions.details}
        onConfirm={() => {
          if (confirmResolverRef.current) {
            confirmResolverRef.current(true);
            confirmResolverRef.current = null;
          }
        }}
        onCancel={() => {
          if (confirmResolverRef.current) {
            confirmResolverRef.current(false);
            confirmResolverRef.current = null;
          }
        }}
      />

      {/* Prompt Window */}
      <ActionPromptDialog
        open={promptOpen}
        onOpenChange={(open) => {
          setPromptOpen(open);
          if (!open && promptResolverRef.current) {
            promptResolverRef.current(null);
            promptResolverRef.current = null;
          }
        }}
        title={promptOptions.title}
        description={promptOptions.description}
        label={promptOptions.label}
        placeholder={promptOptions.placeholder}
        defaultValue={promptOptions.defaultValue}
        required={promptOptions.required}
        multiline={promptOptions.multiline}
        submitText={promptOptions.submitText}
        cancelText={promptOptions.cancelText}
        validate={promptOptions.validate}
        onSubmit={(val) => {
          if (promptResolverRef.current) {
            promptResolverRef.current(val);
            promptResolverRef.current = null;
          }
        }}
        onCancel={() => {
          if (promptResolverRef.current) {
            promptResolverRef.current(null);
            promptResolverRef.current = null;
          }
        }}
      />

      {/* Feedback / Alert Window */}
      <ActionFeedbackDialog
        open={alertOpen}
        onOpenChange={(open) => {
          setAlertOpen(open);
          if (!open && alertResolverRef.current) {
            alertResolverRef.current();
            alertResolverRef.current = null;
          }
        }}
        title={alertOptions.title}
        message={alertOptions.message}
        type={alertOptions.type}
        buttonText={alertOptions.buttonText}
        details={alertOptions.details}
        onClose={() => {
          if (alertResolverRef.current) {
            alertResolverRef.current();
            alertResolverRef.current = null;
          }
        }}
      />
    </ActionDialogContext.Provider>
  );
}

export function useActionDialog(): ActionDialogContextValue {
  const ctx = useContext(ActionDialogContext);
  if (!ctx) {
    throw new Error("useActionDialog must be used within an ActionDialogProvider");
  }
  return ctx;
}
