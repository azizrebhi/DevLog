import click
from cli.auth import login
from cli.sessions import drafts, confirm, log

@click.group()
def cli():
    """DevLog — Your engineering growth tracker"""
    pass

cli.add_command(login)
cli.add_command(drafts)
cli.add_command(confirm)
cli.add_command(log)

if __name__ == "__main__":
    cli()