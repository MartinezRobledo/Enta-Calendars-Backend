const puppeteer = require("puppeteer");

async function getHolidays(year) {
  let browser;

  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Ingresando a feriados Argentina..");

    await page.goto(
      `https://www.argentina.gob.ar/jefatura/feriados-nacionales-${year}`,
      { waitUntil: "networkidle0" }
    );

    // Esperar a que cargue el calendario
    await page.waitForSelector("td.bg-success, td.bg-primary, td.bg-turistico", {
      timeout: 5000
    });

    /**
     * Extraemos feriados reales desde el DOM
     * usando las clases semánticas del calendario
     */
    const holidays = await page.evaluate(() => {
      const cells = document.querySelectorAll(
        "td.bg-success, td.bg-primary, td.bg-turistico"
      );

      const result = [];

      cells.forEach(td => {
        const link = td.querySelector("a");
        if (!link) return;

        // id: feriado-cal-15-6 → día 15, mes 6
        const idMatch = link.id.match(/feriado-cal-(\d+)-(\d+)/);
        if (!idMatch) return;

        const [, day, month] = idMatch;

        result.push({
          day: Number(day),
          month: Number(month) - 1 // meses JS (0–11)
        });
      });

      return result;
    });

    await browser.close();

    // ===============================
    // === FORMATO ORIGINAL DE SALIDA ===
    // ===============================

    const dates = holidays.map(
      h => new Date(Number(year), h.month, h.day)
    );

    // Agregar el 1 de enero del año siguiente
    const nextYearNewYear = new Date(Number(year) + 1, 0, 1);

    const allHolidays = [...dates, nextYearNewYear];

    return { allHolidays, error: "" };

  } catch (error) {
    if (browser) await browser.close();
    console.error("Error al obtener los feriados:", error);
    return { allHolidays: [], error };
  }
}


module.exports = {
    getHolidays,
}