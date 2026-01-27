import { t } from "../i18n";
import { useStore } from "../store";

export function TokenUsage() {
  const totalTokensUsed = useStore((state) => state.totalTokensUsed);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="flex items-center gap-1 text-xs opacity-60">
      <span>
        {formatNumber(totalTokensUsed)} {t("tokens")}
      </span>
    </div>
  );
}
