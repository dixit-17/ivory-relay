import { createFileRoute } from "@tanstack/react-router";
import { IvoryRelay } from "@/components/ivory/game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <IvoryRelay />;
}
