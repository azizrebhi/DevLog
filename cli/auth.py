import click
import httpx
from rich import print
from cli.config import save_token, BASE_URL

@click.command()
@click.option("--email", prompt=True)
@click.option("--password", prompt=True, hide_input=True)
def login(email: str, password: str):
    response = httpx.post(
        f"{BASE_URL}/auth/login",
        data={"username": email, "password": password}
    )
    if response.status_code == 200:
        token = response.json()["access_token"]
        save_token(token)
        print("[green]Logged in successfully[/green]")
    else:
        print("[red]Login failed. Check your credentials.[/red]")