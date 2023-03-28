import {Controller} from "./controller.js";
import {AccountsRepository} from "../repositories/AccountsRepository.js";

export class AccountsController extends Controller {
    #AccountsView;
    #accountsRepository;

    constructor() {
        super();
        this.#accountsRepository = new AccountsRepository();
        this.#setupView();
        this.#loadAllAccounts();
    }
    async #setupView() {
        this.#AccountsView = await super.loadHtmlIntoContent("html_views/accounts.html")
    }

    /**
     * First this function requests all accounts through the repository, after, using the createAcountCard function
     * is creates a html block with the account
     * @returns {Promise<void>}
     */
    async #loadAllAccounts() {
        try {
          const accounts = await this.#accountsRepository.loadAllAccounts();
            for (let i = 0; i < accounts.length; i++) {
                await this.#createAccountCard(accounts[i])
                let buttons = this.#AccountsView.querySelectorAll(".btn-remove")
                buttons.forEach((button) => {
                    button.addEventListener("click", () => {
                        console.log("GebruikersID: " + button.value)
                        this.#removeAccounts(button.value)
                    })
                })
            }
        } catch(e) {
            console.log(e)
        }
    }

    async #removeAccounts(accountId) {
        this.#accountsRepository.removeAccount(accountId);
        this.#AccountsView.querySelector("#card"+accountId).remove()
    }

    /**
     * This method creates a HTML-Card for every user in the database
     * @param account - Account for which to make the card
     */
    #createAccountCard(account) {
        let accountsContainer = document.querySelector("#allAccounts");

        // Because "rang" is a integer in the database we have to convert it to a String
        let rank;
        switch (account.rang) {
            case 0:
                rank = "Invoerder"
                break;
            case 1:
                rank = "Administrator"
                break;
            default:
                rank = "Onbekend"
                break;
        }
        accountsContainer.innerHTML += `
        <div class="border border-dark col-11 m-2" id="card`+account.id+`">
            <div class="p fw-bold">Email Adres: ` + account.email + `</div>
            <div class="p fw-bold">Adres: ` + account.huisnummer + account.huisnummerToevoeging + ` Postcode:  ` + account.postcode + `</div>
            <div class="p fw-bold">Registratiedatum: ` + account.registratieDatum.substring(0, 10) + `</div>
            <div class="p fw-bold">Rang: ` + rank + `</div>
            <button class="btn-sm btn-secondary btn btn-remove" value="` +account.id+`">Verwijder dit account</button>
        </div>`;
    }
}