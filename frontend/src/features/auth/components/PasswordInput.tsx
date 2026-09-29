/**
 * Password field with a show/hide eye toggle.
 *
 * Drop-in replacement for <input type="password" className="input" />.
 * Preserves all native input props so autocomplete, disabled, maxLength,
 * etc. all work as expected.
 */
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional extra classNames for the input (defaults to "input"). */
  inputClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput(
    { inputClassName = "input font-mono", className, ...rest },
    ref,
  ) {
    const [visible, setVisible] = useState(false);

    return (
      <div className={"relative " + (className ?? "")}>
        <input
          {...rest}
          ref={ref}
          type={visible ? "text" : "password"}
          className={inputClassName}
          style={{ paddingRight: 38, ...rest.style }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted hover:text-txt hover:bg-white/5 transition-colors cursor-pointer focusable"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff size={15} strokeWidth={1.9} />
          ) : (
            <Eye size={15} strokeWidth={1.9} />
          )}
        </button>
      </div>
    );
  },
);