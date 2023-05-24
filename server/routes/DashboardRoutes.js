/**
 * Class that contains all of the routes for the dashboard
 * @authors
 *  - beerstj
 */

class DashboardRoutes {
    #app
    #errorCodes = require("../framework/utils/httpErrorCodes");
    #databaseHelper = require("../framework/utils/databaseHelper");
    #requestOptions
    #greenType;
    #avgArray

    constructor(app) {
        this.#app = app;

        this.#getSelectMonthGroen();
        this.#getSelectMonthTree();
        this.#getSelectGevelMaand();

        this.#getFacadeAndTreeGardenData()

        this.#getDashboardDatabaseValues();
        this.#getDashboardAPIValues();

        this.#getInfomation()

        this.#getGreeneryM2Data();

        this.#getPM25DataForChart()

        // map routes
        this.#getGroen();
        this.#requestOptions = {
            method: "GET",
            redirect: "follow"
        }

    }

    /**
     * Gets the values that we want to display on the dashbaord through our database
     * @returns promise that contains the data
     * @author beerstj
     */
    async #getDashboardDatabaseValues() {
        this.#app.get("/dashboard/database", async (req, res) => {
            try {
                let allValues = await this.#databaseHelper.handleQuery({
                    query: "SELECT " +
                        "SUM(CASE WHEN type_id = 1 THEN 1 ELSE 0 END) AS treeGarden, " +
                        "SUM(CASE WHEN type_id = 2 THEN 1 ELSE 0 END) AS facadeGarden, " +
                        "(SELECT COUNT(*) FROM GroeneM2) AS greenery " +
                        "FROM Groen"
                })

                res.status(this.#errorCodes.HTTP_OK_CODE).json({data: allValues})
            } catch (e) {
                res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
            }
        })
    }

    /**
     * Gets the data we want to display from the luchtmeetnet API
     * @returns {Promise<void>}
     * @author beerstj
     */
    async #getDashboardAPIValues() {
        this.#app.get("/dashboard/API/Luchtmeetnet", async (req, res) => {
            let today = new Date(Date.now()).toISOString();
            let yesterday = new Date(Date.now() - 72000001).toISOString();

            try {
                let AQI;
                let PM25;

                await fetch("https://api.luchtmeetnet.nl/open_api/lki?station_number=NL49017&" +
                    "start=" + yesterday +
                    "&end=" + today, this.#requestOptions)
                    .then(function (response) {
                        return response.json();
                    }).then(function (data) {
                        AQI = data.data[0].value;
                    })

                await fetch("https://api.luchtmeetnet.nl/open_api/measurements?" +
                    "start=" + yesterday +
                    "&end=" + today +
                    "&station_number=NL49017&formula=PM25&page=1&order_by=timestamp_measured&order_direction=desc", this.#requestOptions)
                    .then(function (response) {
                        return response.json();
                    }).then(function (data) {
                        PM25 = data.data[0].value
                    })

                res.status(this.#errorCodes.HTTP_OK_CODE).json({AQI: AQI, PM25: PM25})
            } catch (e) {
                res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
            }
        })
    }

    /**
     * Method to get all of the data for the PM25 values, gets the data from the luchtmeetnet
     * @param timespan: timespan you want the data for.
     * @returns {Promise<void>}
     */
    async #getPM25DataForChart() {
        this.#app.get("/dashbaord/api/luchtmeetnet/PM25/timespan/:timespan", async (req, res) => {
            let date1 = new Date(Date.now())
            let date2 = new Date();
            this.#avgArray = []

            switch (req.params.timespan) {
                case "days":

                    for (let i = 0; i < 31; i++) { // Loops through everyday of the timespan selected
                        date2.setDate(date1.getDate() - 1)
                        await this.#calculateAverageFromResult(i, date1, date2)
                        date1.setDate(date1.getDate() - 1)
                    }

                    res.status(this.#errorCodes.HTTP_OK_CODE).json({
                        data: this.#avgArray,
                        label: "Dag gemiddelden van de fijnstof (PM2.5) waardes van de afgelopen 30 dagen.",
                        labels: this.#getLabels(req.params.timespan).reverse()
                    })
                    break;

                case "weeks":
                    for (let i = 0; i < 16; i++) {
                        date2.setDate(date1.getDate() - 7)
                        await this.#calculateAverageFromResult(i, date1, date2)
                        date1.setDate(date2.getDate())
                    }
                    res.status(this.#errorCodes.HTTP_OK_CODE).json({
                        data: this.#avgArray,
                        label: "Week gemiddelden van de fijnstof (PM2.5) waardes van de afgelopen 15 weken.",
                        labels: this.#getLabels(req.params.timespan).reverse()
                    })
                    break;

                case "months":
                    let hardcode = [23.52, 31.33, 24.10, 20.79]
                    let total = 0;

                    let weeks = Math.floor(date1.getDate() / 7)

                    let startOfMonth = new Date(date1.getFullYear(), date1.getMonth(), 1)
                    let weekAfterStartOfMonth = new Date()

                    for (let i = 0; i < weeks; i++) {
                        weekAfterStartOfMonth.setDate(startOfMonth.getDate() + 7)
                        await this.#calculateAverageFromResult(i, weekAfterStartOfMonth, startOfMonth)
                        startOfMonth.setDate(weekAfterStartOfMonth.getDate())
                    }
                    await this.#calculateAverageFromResult(new Date(Date.now()).getMonth(), weekAfterStartOfMonth, startOfMonth)

                    for (let i = 0; i < this.#avgArray.length; i++) {
                        total += this.#avgArray[i]
                    }

                    hardcode.push(total / this.#avgArray.length)
                    res.status(this.#errorCodes.HTTP_OK_CODE).json({
                        data: hardcode,
                        label: "Maand gemiddelden van de fijnstof (PM2.5) waardes tot het begin van het jaar.",
                        labels: this.#getLabels(req.params.timespan)
                    })
                    break;
            }

        })
    }

    /**
     * Calculates the average values between de given dates, from the data collected through the luchtmeetnet API
     * @param i - progress (current iteration)
     * @param date1 - end of date to get the data
     * @param date2 - start of date to get the data
     * @returns {Promise<void>}
     */
    async #calculateAverageFromResult(i, date1, date2) {
        await fetch("https://api.luchtmeetnet.nl/open_api/measurements?" +
            "start=" + date2.toISOString() + "&end=" + date1.toISOString() +
            "&station_number=NL49017&formula=PM25&page=1&order_by=timestamp_measured&order_direction=desc", this.#requestOptions)
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (typeof data !== 'undefined') { // If no data exists for curDay, push 0 to array
                    let total = 0
                    for (let curHour = 0; curHour < data.data.length; curHour++) { // loops through every hour of the day
                        if (typeof data.data[i] !== 'undefined') {
                            total += data.data[i].value
                        } // Checks if curHour is undefined.
                    }
                    // console.log("Progress: " + i + " Current Average: "+ total / data.data.length)
                    if (total === 0) {
                        this.#avgArray.push(null)
                    } else {
                        this.#avgArray.push(total / data.data.length)
                    }
                } else return null
            }.bind(this))

    }

    /**
     * Function to get all of the data for the facade and treegardens added in the selected timespan
     * @param type_id: type you want to get the data for (type_id is column in our database):
     *  - type_id: 1 = treeGarden
     *  - type_id: 2 = facadeGarden
     *  @param timespan: timespan of the data you want
     * @returns {Promise<void>}
     */
    async #getFacadeAndTreeGardenData() {
        this.#app.get("/dashboard/timespan/:timespan/type/:type_id", async (req, res) => {
            switch (req.params.type_id) {
                case "1": // String because req.params.type_id is a string
                    this.#greenType = "Boomtuinen"
                    break;
                case "2":
                    this.#greenType = "Geveltuinen"
                    break;
                default:
                    break;
            }

            let totalArray = []
            let totalNumber = 0;
            let today = new Date(Date.now())
            let weekNumber = Math.ceil((Math.floor((new Date() - (new Date((new Date()).getFullYear(), 0, 1))) / 86400000)) / 7);
            const timespan = req.params.timespan

            switch (timespan) {
                case "days":
                    try {
                        for (let i = 0; i < 31; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT COUNT(datum) as dayTotal FROM Groen WHERE DAY(datum) = ? AND type_id = ? AND MONTH(DATUM) = 3;",
                                values: [i, req.params.type_id]
                            })

                            totalNumber += data[0].dayTotal
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van gemaakte " + this.#greenType + " de de afgelopen 30 dagen",
                            data: totalArray,
                            labels: this.#getLabels(timespan)
                        })
                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
                case "weeks":
                    try {
                        for (let i = weekNumber - 15; i < weekNumber + 1; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT COUNT(datum) AS weekTotal FROM Groen WHERE WEEK(datum) = ? AND type_id = ?",
                                values: [i, req.params.type_id]
                            })

                            totalNumber += data[0].weekTotal
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van gemaakte " + this.#greenType + " de de afgelopen 15 weken",
                            data: totalArray,
                            labels: this.#getLabels(timespan).reverse()
                        })
                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
                case "months":
                    try {
                        for (let i = 1; i < today.getMonth() + 2; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT COUNT(datum) AS monthTotal FROM Groen WHERE MONTH(datum) = ? AND type_id = ?",
                                values: [i, req.params.type_id]
                            })
                            totalNumber += data[0].monthTotal
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van gemaakte " + this.#greenType + " aan het begin van elke maand sinds het begin van het jaar",
                            data: totalArray,
                            labels: this.#getLabels(timespan).reverse()
                        })
                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
            }
        })
    }

    /**
     * Function to retrieve all of the added greenery data in selected timespan.
     * @param timespan: timespan you want for the data
     */
    #getGreeneryM2Data() {
        this.#app.get("/dashboard/greenery/timespan/:timespan", async (req, res) => {
            let totalNumber = 0;
            let totalArray = [];
            let today = new Date(Date.now())
            let weekNumber = Math.ceil((Math.floor((new Date() - (new Date((new Date()).getFullYear(), 0, 1))) / 86400000)) / 7);
            const timespan = req.params.timespan

            switch (timespan) {
                // Gets data for past 30 days by looking through all of them
                case "days":
                    try {
                        for (let i = 0; i < 31; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT COUNT(groenem2) AS GroeneM2 FROM GroeneM2 WHERE DAY(datum) = ? AND MONTH(datum) = ?",
                                values: [i, today.getMonth()]
                            })
                            totalNumber += data[0].GroeneM2
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van geplante Groene M2 de de afgelopen 30 dagen",
                            data: totalArray,
                            labels: this.#getLabels(timespan)
                        })

                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
                // Gets data for past 15 weeks by looking through all of them
                case "weeks":
                    try {
                        for (let i = weekNumber - 16; i < weekNumber; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT SUM(groeneM2) AS weekTotal FROM GroeneM2 WHERE WEEK(datum) = ?",
                                values: [i]
                            })

                            totalNumber += data[0].weekTotal
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van geplante Groene M2 de de afgelopen 15 weken",
                            data: totalArray,
                            labels: this.#getLabels(timespan)
                        })

                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
                // Gets data for past months by looking through all of them
                case "months":
                    try {
                        for (let i = 0; i < today.getMonth() + 1; i++) {
                            let data = await this.#databaseHelper.handleQuery({
                                query: "SELECT COUNT(groenem2) AS GroeneM2 FROM GroeneM2 WHERE MONTH(datum) = ?",
                                values: [i]
                            })
                            totalNumber += data[0].GroeneM2
                            totalArray.push(totalNumber)
                        }
                        res.status(this.#errorCodes.HTTP_OK_CODE).json({
                            label: "Totalen van geplante Groene M2 aan het begin van elke maand sinds het begin van het jaar",
                            data: totalArray,
                            labels: this.#getLabels(timespan)
                        })

                    } catch (e) {
                        res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
                    }
                    break;
            }
        })
    }

    // map routes @author Aleksandrs
    async #getGroen() {
        this.#app.get("/map/getGroen", async (req, res) => {
            try {
                let data = await this.#databaseHelper.handleQuery({
                    query: "SELECT result.opmerking, result.datum, result.coordinaatX, result.coordinaatY, type.naam FROM (SELECT * FROM gebied inner join groen ON gebied.Gebiedsnummer = groen.gebied_id) as result INNER JOIN type ON result.type_id = type.id"
                })

                res.status(this.#errorCodes.HTTP_OK_CODE).json({data: data});
            } catch (e) {
                res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
            }
        })
    }

    /**
     * Gets all of the information for the modal on the dashboard from our database
     * @returns {Promise<void>}
     * @author beerstj
     */
    async #getInfomation() {
        this.#app.get("/dashboard/information/:id", async (req, res) => {
            try {
                let data = await this.#databaseHelper.handleQuery({
                    query: "SELECT * FROM informationModal WHERE id = ?",
                    values: [req.params.id]
                })

                res.status(this.#errorCodes.HTTP_OK_CODE).json({data: data})
            } catch (e) {
                res.status(this.#errorCodes.BAD_REQUEST_CODE).json({reason: e})
            }
        })
    }

    /**
     * Helper function to get all of the correct labels for the charts
     * @param timespan - timespan in where you want the labels (options: "days", "weeks", "months")
     * @returns {*[]}
     */
    #getLabels(timespan) {
        const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
        let weekNumber = Math.ceil((Math.floor((new Date() - (new Date((new Date()).getFullYear(), 0, 1))) / 86400000)) / 7); //Number of currentWeek
        let labelArray = [];

        switch (timespan) {
                // Gets past 31 days in format dayNumber + "curMonth"
            case "days":
                for (let i = 0; i < 31; i++) {
                    let date = new Date();
                    date.setDate(date.getDate() - i);
                    let dayNumber = date.getDate()
                    let month = months[date.getMonth()]
                    labelArray.push(dayNumber + " " + month);
                }
                labelArray.reverse()
                break;
                // Gets past 15 weeks in format: "Week" + weekNumber
            case "weeks":
                for (let i = weekNumber - 15; i < weekNumber + 1; i++) {
                    labelArray.push("Week " + i)
                }
                break;
                // Gets month from start of year to now. In string format
            case "months":
                for (let i = 0; i < new Date(Date.now()).getMonth() + 1; i++) {
                    labelArray.push(months[i])
                }
                break;
            default:
                break;
        }

        return labelArray;
    }
}

module.exports = DashboardRoutes;