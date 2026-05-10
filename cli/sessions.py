import click
import httpx
from rich import print
from cli.config import BASE_URL, get_token

@click.command()
def drafts():
    token = get_token()
    if not token:
        print("[red]Not logged in. Run: devlog login[/red]")
        return
    headers = {"Authorization": f"Bearer {token}"}
    response = httpx.get(f"{BASE_URL}/sessions/drafts", headers=headers)
    data = response.json()
    if not data:
        print("[yellow]No drafts exist[/yellow]")
        return
    print("[bold]Draft Sessions:[/bold]")
    for idx, session in enumerate(data, 1):
        print(f"[cyan]{idx}.[/cyan] Project: [green]{session['project']}[/green] | Date: {session['date']} | ID: {session['id']}")

@click.command()
def confirm():
    token = get_token()
    if not token:
        print("[red]Not logged in. Run: devlog login[/red]")
        return
    headers = {"Authorization": f"Bearer {token}"}
    response = httpx.get(f"{BASE_URL}/sessions/drafts", headers=headers)
    data = response.json()
    if not data:
        print("[yellow]No drafts exist[/yellow]")
        return
    print("[bold]Draft Sessions:[/bold]")
    for idx, session in enumerate(data, 1):
        print(f"[cyan]{idx}.[/cyan] Project: [green]{session['project']}[/green] | Date: {session['date']} | ID: {session['id']}")
    # Prompt user to pick
    choice = click.prompt("Enter the number of the draft to confirm", type=int)
    if not (1 <= choice <= len(data)):
        print("[red]Invalid choice.[/red]")
        return
    session_id = data[choice - 1]["id"]
    # PATCH to confirm (set status to completed)
    patch_data = {"status": "completed"}
    patch_response = httpx.patch(f"{BASE_URL}/sessions/{session_id}", headers=headers, json=patch_data)
    if patch_response.status_code == 200:
        print("[green]Session confirmed as completed![/green]")
    else:
        print(f"[red]Failed to confirm session: {patch_response.text}[/red]")








