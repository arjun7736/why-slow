import chalk from "chalk";
import { getDbStats, getHttpStats } from "./store";
import type { TimelineEvent } from "./types";

function line() {
  return chalk.gray("─".repeat(50));
}

function pad(label: string, length = 14) {
  return label.padEnd(length, " ");
}

export function printReport(
  method: string,
  url: string,
  total: number,
  timeline: TimelineEvent[]
) {
  const db = getDbStats(timeline);
  const http = getHttpStats(timeline);

  const middlewareEvents = timeline.filter((e) => e.type === "middleware");
  const middlewareTime = middlewareEvents.reduce((a, e) => a + e.duration, 0);

  const appTime = total - db.totalTime - http.totalTime - middlewareTime;
  const nonDbTime = total - db.totalTime;

  const status =
    total < 100
      ? chalk.green("● FAST")
      : total < 500
      ? chalk.yellow("● OK")
      : chalk.red("● SLOW");

  const methodColored = chalk.bold.cyan(method.padEnd(6));
  const urlColored = chalk.bold.white(url);
  const timeColored = chalk.bold(`${total}ms`);

  console.log(`
${line()}
🚀 ${methodColored} ${urlColored} → ${timeColored} ${status}
${line()}

${chalk.gray("Performance")}
  ${chalk.gray(pad("🗄 DB"))} ${chalk.yellow(`${db.totalTime}ms`)}   ${chalk.gray(
    `(${db.totalCalls} calls, ${db.uniqueQueries} unique)`
  )}
  ${chalk.gray(pad("🔁 Repeated"))} ${chalk.magenta(
    `${db.repeatedCalls}`
  )} queries
  ${chalk.gray(pad("🌐 External"))} ${chalk.blue(
    `${http.totalTime}ms`
  )}   ${chalk.gray(`(${http.totalCalls} calls)`)}
  ${chalk.gray(pad("⚙️ Middleware"))} ${chalk.cyan(`${middlewareTime}ms`)}
  ${chalk.gray(pad("🧠 App"))} ${chalk.green(`${appTime}ms`)}

  ${chalk.gray(pad("Total"))} ${chalk.bold(`${total}ms`)}

`);

  if (http.services.size > 0) {
    console.log(chalk.gray("External services"));
    for (const [service, count] of http.services.entries()) {
      console.log(
        `  ${chalk.gray("•")} ${service} ${chalk.gray(`(${count} calls)`)}`
      );
    }
    console.log();
  }
}